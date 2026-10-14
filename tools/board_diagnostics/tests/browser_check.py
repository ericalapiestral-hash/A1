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
        assert 'COM5' in report and 'VID 10C4 / PID EA60' in report and '실제 펌웨어의 센서 제거 여부는 미확인' in report
        assert '점검 프로그램: v1.1' in report
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
        page.evaluate("emitSerial('pH=9.65(1.174V) | 탁도=3.118V | 수위낮음=1 | 급수=1 | 순환=1\\n')")
        assert page.locator('#ph').inner_text()=='9.65'
        assert page.locator('#turb').inner_text()=='3.118 V'
        assert page.locator('#turbLabel').inner_text()=='탁도 센서 신호 전압'
        assert page.locator('#level').inner_text()=='부족'
        assert page.locator('#heater').inner_text()=='미수신'
        assert page.locator('#sensorLines').inner_text()=='문자 센서 상태 1줄'
        page.get_by_role('button',name='연결 종료',exact=True).click()
        page.wait_for_function("document.getElementById('phase').textContent==='연결 전'")
        saved_report='\ufeffAquaControl 보드 점검 보고서\n보고된 센서/출력: {"ph":1,"heaterOn":true}\n\n--- 수신 로그 (최근 최대 262144 문자) ---\npH=7.25(1.600V) | 탁도=3.118V | 수위낮음=0 | 급수=0 | 순환=1'
        page.locator('#import').set_input_files({'name':'saved-report.txt','mimeType':'text/plain','buffer':saved_report.encode('utf-8')})
        page.wait_for_function("document.getElementById('phase').textContent==='저장 로그 분석'")
        assert page.locator('#ph').inner_text()=='7.25'
        assert page.locator('#turb').inner_text()=='3.118 V'
        assert page.locator('#level').inner_text()=='정상'
        assert page.locator('#heater').inner_text()=='미수신'
        assert page.locator('#frames').inner_text()=='0 / 0'
        assert page.locator('#sensorLines').inner_text()=='문자 센서 상태 1줄'
        with page.expect_download() as imported_download:
            page.get_by_role('button',name='점검 보고서 TXT 저장').click()
        imported_output=Path('/tmp/aqua-board-diagnostics-import-report.txt')
        imported_download.value.save_as(imported_output)
        imported_text=imported_output.read_text(encoding='utf-8-sig')
        assert '문자 센서 상태 줄: 1' in imported_text and '"turb":"V"' in imported_text
        assert '보고된 센서/출력: {"ph":7.25' in imported_text
        assert not errors,errors
        print('Browser check passed: secure localhost, read-only serial, JSON/ASCII telemetry, report download/import, explicit units, clean reconnect.')
        browser.close()
finally:
    server.shutdown();server.server_close()
