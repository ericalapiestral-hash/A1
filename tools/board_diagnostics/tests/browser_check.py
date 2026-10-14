"""Exercise the shipped HTML with a simulated serial stream, never a real board."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/AquaControl-Board-Diagnostics.html'
mock = r'''
window.portCalls=[];
class MockSerial extends EventTarget {
  constructor() { super(); this.port={
    getInfo:()=>({usbVendorId:0x10c4,usbProductId:0xea60}),
    open:async opts=>{window.portCalls.push(['open',opts]);this.port.readable=new ReadableStream({start:c=>window.serialController=c});},
    setSignals:async x=>window.portCalls.push(['signals',x]),
    close:async()=>{window.portCalls.push(['close']);this.port.readable=null;}
  };Object.defineProperty(this.port,'writable',{get:()=>{throw new Error('Read-only tool accessed a write stream');}}); }
  async requestPort(){return this.port;}
  async getPorts(){return [];}
}
Object.defineProperty(navigator,'serial',{value:new MockSerial(),configurable:true});
window.emitSerial=text=>window.serialController.enqueue(new TextEncoder().encode(text));
'''
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        plain=browser.new_page(viewport={'width':1360,'height':1000})
        plain.goto(url)
        assert plain.evaluate('isSecureContext && !!navigator.serial')
        plain.screenshot(path='/tmp/aqua-board-diagnostics-ui.png',full_page=True)
        page=browser.new_page(viewport={'width':1360,'height':1000},accept_downloads=True)
        page.add_init_script(mock)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url)
        with page.expect_download() as empty_download:
            page.get_by_role('button',name='점검 보고서 TXT 저장').click()
        empty_output=Path('/tmp/aqua-board-diagnostics-empty-report.txt')
        empty_download.value.save_as(empty_output)
        assert '수신 바이트: 0' in empty_output.read_text(encoding='utf-8-sig')
        page.get_by_role('button',name='포트 선택·연결').click()
        page.wait_for_function("document.getElementById('phase').textContent==='USB 시리얼 연결됨'")
        page.evaluate('emitSerial(\'{"ph":9.7{"ph":9.70,"turb":3.12,"water_low":1,"ht":0,"sup":1,"cir":0}\\n\')')
        assert page.locator('#ph').inner_text()=='9.70'
        assert page.locator('#level').inner_text()=='부족'
        assert page.locator('#pump1').inner_text()=='보드 ON'
        assert page.locator('#frames').inner_text()=='1 / 1'
        assert page.locator('#connect').is_disabled()
        assert page.locator('#import').is_disabled()
        page.locator('#com').fill('COM5')
        with page.expect_download() as download:
            page.get_by_role('button',name='점검 보고서 TXT 저장').click()
        output=Path('/tmp/aqua-board-diagnostics-test-report.txt')
        download.value.save_as(output)
        report=output.read_text(encoding='utf-8-sig')
        assert 'COM5' in report and 'VID 10C4 / PID EA60' in report and '수온 센서: 사용 안 함' in report
        page.get_by_role('button',name='연결 종료',exact=True).click()
        page.wait_for_function("document.getElementById('phase').textContent==='연결 전'")
        calls=page.evaluate('portCalls')
        assert calls[0][1]['baudRate']==115200
        assert calls[1]==['signals',{'dataTerminalReady':False,'requestToSend':False}]
        assert calls[-1]==['close']
        assert not errors,errors
        page.get_by_role('button',name='포트 선택·연결').click()
        page.wait_for_function("document.getElementById('phase').textContent==='USB 시리얼 연결됨'")
        assert page.locator('#ph').inner_text()=='미수신'
        page.get_by_role('button',name='연결 종료',exact=True).click()
        page.wait_for_function("document.getElementById('phase').textContent==='연결 전'")
        print('Browser check passed: secure localhost, read-only connect/close, fragmented JSON, report download, clean reconnect.')
        browser.close()
finally:
    server.shutdown();server.server_close()
