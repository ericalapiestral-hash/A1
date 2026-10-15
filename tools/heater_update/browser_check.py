"""Simulated flash and Web Serial only. Uses supplied original image as data."""
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
window.calls=[];
AquaBackupVendor.Transport=class {async disconnect(){calls.push('disconnect');}};
AquaBackupVendor.ESPLoader=class {
 constructor(){this.chip={CHIP_NAME:'ESP32',readMac:async()=> '02:04:06:08:0a:0c'};this.IS_STUB=true;this.secureDownloadMode=false;}
 async command(){return 0;}async main(){return 'mock ESP32';}async detectFlashSize(){return '4MB';}async readReg(){return 0;}
 async flashMd5sum(address,n){return SparkMD5.ArrayBuffer.hash(mockFlash.slice(address,address+n).buffer);}
 async writeFlash(options){
  if(options.eraseAll||options.fileArray.length!==1||options.fileArray[0].address!==0x10000)throw Error('non-app write');
  const {address,data}=options.fileArray[0],request=new Uint8Array(16),v=new DataView(request.buffer);v.setUint32(0,data.length,true);v.setUint32(12,address,true);
  await this.command(16,request);mockFlash.set(data,address);calls.push(['write',data.length]);options.reportProgress(0,data.length,data.length);
 }async after(mode){calls.push(['reset',mode]);}
};
Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>({})},configurable:true});
'''
serial=r'''
window.usbWrites=[];window.signalCalls=[];window.pushUsb=null;window.heldInReset=true;window.autoStatus=false;
window.statusFixture={firmware:'Aquarium-control-1.2.0',heaterManualSupported:false,pin18:1,check18:false,estop:0};
window.usbPort={
 async open(options){window.openOptions=options;heldInReset=true;},async close(){},
 async setSignals(options){signalCalls.push(options);heldInReset=options.dataTerminalReady||options.requestToSend;},
 readable:new ReadableStream({start(c){window.pushRaw=data=>c.enqueue(new TextEncoder().encode(data));window.pushUsb=data=>pushRaw(data+'\n');}}),
 writable:new WritableStream({write(bytes){const text=new TextDecoder().decode(bytes);usbWrites.push(text);if(text==='status\n'&&autoStatus&&!heldInReset){const raw='\uFEFFI (USB) '+JSON.stringify(statusFixture);pushRaw(raw.slice(0,22));pushRaw(raw.slice(22));}}})
};
Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>usbPort},configurable:true});
'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/Aquarium-B-Heater-Update.html');page.evaluate(mock)
  page.evaluate('(b)=>window.mockFlash=Uint8Array.from(atob(b),c=>c.charCodeAt(0))',base64.b64encode(backup).decode())
  page.locator('#backup').set_input_files({'name':'original-private-B.bin','mimeType':'application/octet-stream','buffer':backup})
  page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('백업 확인 완료')")
  page.locator('#ready').check();assert page.locator('#start').is_enabled()
  # Reconstruct the actual prior v1.1.0 supply2 image, then detect and preserve it.
  page.evaluate("async()=>{const meta=AQUARIUM_MANIFEST.previousTemplates[0];const old=Uint8Array.from(atob(AQUARIUM_PREVIOUS_BASE64[0]),c=>c.charCodeAt(0));const peer=mockFlash.slice(AQUARIUM_MANIFEST.originalPeerOffset,AQUARIUM_MANIFEST.originalPeerOffset+6);mockFlash.set(await personalize(old,meta,peer,hashes.sha256,2),0x10000);}")
  page.locator('#start').click();page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('업데이트·체크섬 확인 완료')")
  page.wait_for_function("() => !document.getElementById('ready').disabled")
  assert page.evaluate('result.supplyPolarity===2 && result.heaterPolarity===0 && result.previousVersion===\'1.1.0\'')
  assert page.evaluate('mockFlash[0x10000+AQUARIUM_MANIFEST.peerConfigOffset+38]===2 && mockFlash[0x10000+AQUARIUM_MANIFEST.peerConfigOffset+39]===0')
  page.locator('#heaterPolarity').select_option('1');page.wait_for_function("() => !preparing")
  page.locator('#ready').check();assert page.locator('#start').is_disabled()
  page.locator('#heaterConfirmed').check();assert page.locator('#start').is_enabled()
  page.locator('#start').click();page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('업데이트·체크섬 확인 완료')")
  page.wait_for_function("() => !document.getElementById('ready').disabled")
  assert page.evaluate('mockFlash[0x10000+AQUARIUM_MANIFEST.peerConfigOffset+39]===1 && result.supplyPolarity===2')
  with page.expect_download() as download:page.locator('#save').click()
  report=Path('/tmp/aquarium-heater-updater-report.txt');download.value.save_as(report)
  assert '"heaterPolarity":1' in report.read_text(encoding='utf-8-sig')
  page.locator('#operation').select_option('rollback');page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('급수·순환 v1.1.0 복원')")
  page.wait_for_function("() => !document.getElementById('ready').disabled")
  assert page.evaluate('hashes.md5(mockFlash.slice(0x10000,0x10000+images.rollbackVariants[2].length))===hashes.md5(images.rollbackVariants[2])')
  page.locator('#operation').select_option('rollbackCirculation');page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('순환 v1.0.1 복원')")
  page.wait_for_function("() => !document.getElementById('ready').disabled")
  assert page.evaluate('hashes.md5(mockFlash.slice(0x10000,0x10000+images.rollbackCirculation.length))===hashes.md5(images.rollbackCirculation)')
  page.locator('#operation').select_option('restore');page.locator('#ready').check();page.locator('#start').click()
  page.wait_for_function("() => document.getElementById('phase').textContent.startsWith('원본 복원')")
  page.wait_for_function("() => !document.getElementById('ready').disabled")
  assert page.evaluate('hashes.md5(mockFlash.slice(0x10000,0x10000+images.original.length))===images.originalMd5')
  page.close()
  # USB checker exercises UI permission/firmware gates, not real hardware.
  page=browser.new_page(accept_downloads=True);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/Heater-Relay-Check.html');page.evaluate(serial)
  assert page.locator('#low').is_disabled();page.locator('#connect').click();page.wait_for_function('() => !!writer')
  assert page.evaluate('signalCalls.length===1 && signalCalls[0].dataTerminalReady===false && signalCalls[0].requestToSend===false')
  assert page.evaluate("openOptions.flowControl==='none' && openOptions.baudRate===115200")
  page.evaluate("pushUsb(JSON.stringify({firmware:'Aquarium-pumps-1.1.0',heaterManualSupported:false,pin18:1,check18:false,estop:0}))")
  page.locator('#ready').check();assert page.locator('#low').is_disabled()
  page.evaluate("pushUsb(JSON.stringify({firmware:'Aquarium-control-1.2.0',heaterManualSupported:true,pin18:1,check18:false,estop:0}))")
  page.wait_for_function("() => document.getElementById('locked').textContent.includes('활성화')");assert page.locator('#low').is_disabled()
  page.evaluate("pushUsb(JSON.stringify({firmware:'Aquarium-control-1.2.0',heaterManualSupported:false,pin18:1,check18:false,estop:0}))")
  page.wait_for_function("() => !document.getElementById('low').disabled")
  assert page.evaluate("usbWrites.every(x=>x==='status\\n')")
  page.locator('#low').click();page.wait_for_function("() => usbWrites.includes('check18=0\\n')")
  page.evaluate("pushUsb(JSON.stringify({firmware:'Aquarium-control-1.2.0',heaterManualSupported:false,pin18:0,check18:true,estop:0}))")
  page.wait_for_function("() => document.getElementById('checking').textContent.includes('점검 중')")
  page.locator('#ready').uncheck();page.wait_for_function("() => usbWrites.includes('check18=stop\\n')")
  assert page.locator('#high').is_disabled()
  page.evaluate('lastAt=Date.now()-4000;render()');page.locator('#ready').check();assert page.locator('#low').is_disabled()
  page.locator('#observation').fill('Mock observation only; actual wiring not verified.')
  with page.expect_download() as download:page.locator('#save').click()
  report=Path('/tmp/aquarium-heater-relay-check-report.txt');download.value.save_as(report)
  assert 'Mock observation' in report.read_text(encoding='utf-8-sig')
  page.locator('#disconnect').click();page.wait_for_function('() => port===null')
  page.close()
  # A reset-held mock stays silent until both signals are released and status is requested.
  page=browser.new_page(accept_downloads=True);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/Heater-Relay-Check.html');page.evaluate(serial);page.evaluate('autoStatus=true')
  page.locator('#connect').click();page.wait_for_function('() => statusCount>=1')
  assert page.evaluate("signalReleased && !heldInReset && rxBytes>0 && signalCalls.length===1 && usbWrites.every(x=>x==='status\\n')")
  assert page.locator('#low').is_disabled() # Fresh status alone must not bypass load-power confirmation.
  assert '잠금 상태 확인' in page.locator('#phase').inner_text()
  page.evaluate('autoStatus=false');page.locator('#ready').check();assert page.locator('#low').is_enabled()
  # Corrupt first frame, UTF-8 prefix, split chunks, multiple objects without newline resynchronize.
  page.evaluate("pushRaw('{bad-partial');pushRaw('I '+JSON.stringify(statusFixture));pushRaw(JSON.stringify(statusFixture))")
  page.wait_for_function('() => statusCount>=3')
  page.evaluate("pushUsb('boot:0x3 (DOWNLOAD_BOOT) waiting for download')")
  page.wait_for_function('() => bootloader')
  assert page.locator('#low').is_disabled();assert '다운로드 모드' in page.locator('#phase').inner_text()
  page.locator('#ready').uncheck();assert page.locator('#restart').is_disabled()
  page.locator('#ready').check();page.evaluate('autoStatus=true');page.locator('#restart').click()
  page.wait_for_function('() => !restarting && recognized()')
  assert page.evaluate('signalCalls.length===3 && signalCalls[1].requestToSend===true && signalCalls[1].dataTerminalReady===false && signalCalls[2].requestToSend===false')
  assert page.evaluate("usbWrites.every(x=>x==='status\\n')") # Reset/status actions never send relay commands.
  page.locator('#disconnect').click();page.wait_for_function('() => port===null');page.close()
  page=browser.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/Heater-Relay-Check.html');page.evaluate(serial)
  page.locator('#connect').click();page.wait_for_function('() => !!writer')
  page.evaluate('connectedAt=Date.now()-9000;render()')
  assert '수신 0바이트' in page.locator('#phase').inner_text();assert page.locator('#low').is_disabled()
  assert page.evaluate('signalCalls.length===1') # Timeout never resets a board automatically.
  page.locator('#disconnect').click();page.wait_for_function('() => port===null')
  assert not errors,errors
  browser.close()
 print('Heater browser passed: updater/restore unchanged; serial DTR/RTS release, status recovery from silence, framing, bootloader/manual-reset flow, no-data guidance, power/firmware/stale gates and explicit relay commands.')
finally:server.shutdown();server.server_close()
