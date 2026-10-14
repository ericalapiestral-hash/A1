"""Use supplied private backup as data with a simulated loader, never real USB."""
import argparse,base64,hashlib
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser();parser.add_argument('--backup',required=True,type=Path);args=parser.parse_args()
backup=args.backup.read_bytes();assert len(backup)==4194304
root=Path(__file__).resolve().parent
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
mock=r'''
window.calls=[];window.mockMac='02:04:06:08:0a:0c';
AquaBackupVendor.Transport=class {constructor(port){this.port=port;}async disconnect(){calls.push('disconnect');}};
AquaBackupVendor.ESPLoader=class {
 constructor(){this.chip={CHIP_NAME:'ESP32',readMac:async()=>window.mockMac};this.IS_STUB=true;this.secureDownloadMode=false;}
 async command(op,data){calls.push(['command',op]);return 0;}
 async main(){return 'ESP32 simulated';}
 async detectFlashSize(){return '4MB';}
 async readReg(){return 0;}
 async flashMd5sum(address,length){const bytes=mockFlash.slice(address,address+length);return SparkMD5.ArrayBuffer.hash(bytes.buffer);}
 async writeFlash(options){
  if(options.eraseAll || options.fileArray.length!==1 || options.fileArray[0].address!==0x10000)throw new Error('Non-app write attempted');
  const {address,data}=options.fileArray[0];const request=new Uint8Array(16);const view=new DataView(request.buffer);view.setUint32(0,data.length,true);view.setUint32(12,address,true);
  await this.command(0x10,request);mockFlash.set(data,address);calls.push(['write',address,data.length]);options.reportProgress(0,data.length,data.length);
 }
 async after(mode){calls.push(['reset',mode]);}
};
Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>({getInfo:()=>({usbVendorId:0x1a86,usbProductId:0x7523})})},configurable:true});
'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/Aquarium-B-Pump-Update.html')
  assert page.locator('#start').is_disabled();page.evaluate(mock)
  page.evaluate('(data)=>{window.mockFlash=Uint8Array.from(atob(data),c=>c.charCodeAt(0));}',base64.b64encode(backup).decode())
  page.locator('#backup').set_input_files({'name':'private-B-backup.bin','mimeType':'application/octet-stream','buffer':backup})
  page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('백업 확인 완료')")
  assert page.locator('#start').is_disabled();page.locator('#ready').check()
  assert page.locator('#start').is_disabled() # Unknown supply output cannot be installed.
  page.locator('#operation').select_option('rollback');assert page.locator('#start').is_enabled()
  page.locator('#operation').select_option('install');assert page.locator('#start').is_disabled()
  page.locator('#supplyPolarity').select_option('1')
  page.wait_for_function("() => document.getElementById('phase').textContent.includes('급수 설정 완료')")
  # Start from the currently working v1.0.1 with a fresh browser (no saved binding).
  page.evaluate('mockFlash.set(images.rollback,0x10000)')
  page.locator('#start').click()
  page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('업데이트·체크섬 확인 완료')")
  page.wait_for_function("() => !document.getElementById('ready').disabled")
  calls=page.evaluate('calls');writes=[c for c in calls if isinstance(c,list) and c[0]=='write'];assert len(writes)==1 and writes[0][1]==0x10000
  assert page.evaluate("mockFlash[0x10000]===0xe9")
  assert page.evaluate('mockFlash[0x10000+AQUARIUM_MANIFEST.peerConfigOffset+38]===1')
  assert not page.locator('#ready').is_checked()
  with page.expect_download() as download:page.locator('#save').click()
  output=Path('/tmp/aquarium-updater-browser-report.txt');download.value.save_as(output)
  assert '"operation":"install"' in output.read_text(encoding='utf-8-sig')
  # Correcting a polarity is an accepted app upgrade, independent of storage.
  page.evaluate('binding=null')
  page.locator('#supplyPolarity').select_option('2')
  page.wait_for_function("() => document.getElementById('phase').textContent.includes('급수 설정 완료')")
  page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('업데이트·체크섬 확인 완료')")
  page.wait_for_function("() => !document.getElementById('ready').disabled")
  assert page.evaluate('mockFlash[0x10000+AQUARIUM_MANIFEST.peerConfigOffset+38]===2')
  page.locator('#operation').select_option('rollback');page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("() => document.getElementById('phase').textContent==='순환 v1.0.1 복원·체크섬 확인 완료'")
  page.wait_for_function("() => !document.getElementById('ready').disabled")
  assert page.evaluate('SparkMD5.ArrayBuffer.hash(mockFlash.slice(0x10000,0x10000+images.rollback.length).buffer)===hashes.md5(images.rollback)')
  page.locator('#operation').select_option('restore');page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("() => document.getElementById('phase').textContent==='원본 복원·체크섬 확인 완료'")
  page.wait_for_function("() => !document.getElementById('ready').disabled")
  restored_hash=page.evaluate("async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',mockFlash)),x=>x.toString(16).padStart(2,'0')).join('')")
  # The shorter install leaves original tail bytes intact; restoring the app is
  # therefore bit-for-bit identical to the full input fixture.
  assert restored_hash==hashlib.sha256(backup).hexdigest()
  page.evaluate("window.mockMac='12:14:16:18:1a:1c';mockFlash[0x10004]^=1")
  page.locator('#operation').select_option('install');page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('중단:')")
  assert 'B보드 펌웨어가 아닙니다' in page.locator('#phase').inner_text()
  writes=page.evaluate("calls.filter(c=>Array.isArray(c)&&c[0]==='write')");assert len(writes)==4
  assert not errors,errors
  browser.close()
 print('Updater browser passed: required supply selection, real images, v1.0.1 upgrade without binding, both supply polarities, report, v1.0.1 rollback, original restore, foreign-device rejection.')
finally:
 server.shutdown();server.server_close()
