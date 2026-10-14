"""Simulated ESP loader only; actual USB hardware is not available here."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import hashlib
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent
data=bytearray(1048576);data[0x1000]=0xe9
expected_md5=hashlib.md5(data).hexdigest();expected_sha=hashlib.sha256(data).hexdigest()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
mock=r'''
window.calls=[];window.corrupt=false;window.pauseRead=false;
AquaBackupVendor.Transport=class {
 constructor(port){this.port=port;}
 async disconnect(){calls.push('disconnect');if(window.readReject){const reject=window.readReject;window.readReject=null;reject(new Error('mock USB closed'));}}
};
AquaBackupVendor.ESPLoader=class {
 constructor({transport}){this.transport=transport;this.chip={CHIP_NAME:'ESP32'};this.IS_STUB=true;this.secureDownloadMode=false;}
 async command(op){calls.push(['command',op]);return 0;}
 async main(){await this.command(0x08);await this.command(0x05);return 'ESP32 mock';}
 async detectFlashSize(){return '1MB';}
 async flashMd5sum(addr,size){calls.push(['md5',addr,size]);return window.expectedMd5;}
 async readFlash(addr,size,progress){calls.push(['read',addr,size]);if(window.pauseRead)return await new Promise((resolve,reject)=>window.readReject=reject);const bytes=new Uint8Array(size);bytes[0x1000]=0xe9;if(window.corrupt)bytes[5]=1;progress(bytes,size,size);return bytes;}
 async after(mode){calls.push(['reset',mode]);}
};
Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>({getInfo:()=>({usbVendorId:0x1a86,usbProductId:0x7523})})},configurable:true});
'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/AquaControl-Firmware-Backup.html')
  assert page.evaluate("typeof AquaBackupVendor.ESPLoader==='function' && typeof SparkMD5.ArrayBuffer.hash==='function'")
  assert page.locator('#start').is_disabled()
  assert page.locator('#saveBin').is_disabled()
  page.evaluate(mock);page.evaluate('(value)=>window.expectedMd5=value',expected_md5)
  page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("!document.getElementById('saveBin').disabled")
  assert page.locator('#phase').inner_text().startswith('백업 검증 완료')
  assert not page.locator('#ready').is_checked()
  with page.expect_download() as download:page.locator('#saveBin').click()
  output=Path('/tmp/aqua-backup-browser-test.bin');download.value.save_as(output)
  assert output.read_bytes()==data
  with page.expect_download() as report_download:page.locator('#saveReport').click()
  report_path=Path('/tmp/aqua-backup-browser-test.txt');report_download.value.save_as(report_path)
  report=report_path.read_text(encoding='utf-8-sig')
  assert expected_md5 in report and expected_sha in report and '용량: 1048576' in report
  calls=page.evaluate('calls');assert ['read',0,1048576] in calls
  assert calls[-2:]==[['reset','hard_reset'],'disconnect']
  assert all(c[1] not in [2,3,4,16,17,18,208,209] for c in calls if isinstance(c,list) and c[0]=='command')
  page.evaluate('window.corrupt=true');page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("document.getElementById('phase').textContent.startsWith('백업 실패')")
  assert page.locator('#saveBin').is_disabled()
  assert 'MD5가 다릅니다' in page.locator('#phase').inner_text()
  page.wait_for_function("!document.getElementById('ready').disabled")
  page.evaluate('window.corrupt=false;window.pauseRead=true')
  page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("typeof window.readReject==='function'")
  page.locator('#stop').click()
  page.wait_for_function("!document.getElementById('ready').disabled")
  assert page.locator('#saveBin').is_disabled()
  assert page.locator('#phase').inner_text()=='백업 중단 · 검증된 BIN 없음'
  assert not errors,errors
  browser.close()
 print('Backup browser checks passed: bundled vendor load, preparation gate, verified BIN/report, flash write guard, reset/close, corrupted and cancelled backups denied.')
finally:
 server.shutdown();server.server_close()
