const el=id=>document.getElementById(id);
let backup=null,transport=null,loader=null,running=false,cancelled=false;
let terminalText='',usbIdentity='선택 전';
const log=text=>{terminalText=(terminalText+String(text)+'\n').slice(-65536);el('log').value=terminalText;el('log').scrollTop=el('log').scrollHeight;};
function render() {
  el('start').disabled=running || !el('ready').checked || !navigator.serial || !isSecureContext;
  el('ready').disabled=running;
  el('stop').disabled=!running || cancelled;
  el('saveBin').disabled=!backup || running;
  el('saveReport').disabled=running;
}
function download(data,name,type) {
  const url=URL.createObjectURL(new Blob([data],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function report() {
  return '\uFEFFAquaControl B보드 펌웨어 백업 보고서 v1.0\n'+
    `작성: ${new Date().toISOString()}\nUSB: ${usbIdentity}\n브라우저: ${navigator.userAgent}\n상태: ${el('phase').textContent}\n`+
    (backup?`칩: ${backup.description}\n시작 주소: 0x00000000\n용량: ${backup.size}\nMD5(보드 원본과 일치): ${backup.md5}\nSHA-256: ${backup.sha256}\n`:'검증된 전체 BIN 없음\n')+
    '동작: 부트로더 통신·임시 RAM 읽기 도구 사용·플래시 읽기. 플래시 쓰기/삭제 없음.\n'+
    '\n--- 진행 로그 ---\n'+terminalText;
}
el('ready').addEventListener('change',render);
el('start').addEventListener('click',async()=>{
  if (running || !el('ready').checked) return;
  running=true;cancelled=false;backup=null;terminalText='';el('log').value='';el('progress').value=0;el('percent').textContent='0%';render();
  let port;
  try {
    el('phase').textContent='B보드 USB 포트 선택';
    port=await navigator.serial.requestPort();
    if (cancelled) throw new Error('사용자가 백업을 중단했습니다.');
    const info=port.getInfo();const hex=x=>Number.isInteger(x)?x.toString(16).toUpperCase().padStart(4,'0'):'미확인';
    usbIdentity=`VID ${hex(info.usbVendorId)} / PID ${hex(info.usbProductId)}`;log(usbIdentity);
    transport=new AquaBackupVendor.Transport(port,false);
    loader=new AquaBackupVendor.ESPLoader({transport,baudrate:115200,romBaudrate:115200,terminal:{clean:()=>{},writeLine:log,write:log},debugLogging:false});
    const result=await readFirmwareBackup(loader,{
      md5:data=>SparkMD5.ArrayBuffer.hash(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)),
      sha256:async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join(''),
      onPhase:text=>{if(cancelled)throw new Error('백업 중단');el('phase').textContent=text;log(text);},
      onProgress:(done,total)=>{if(cancelled)throw new Error('백업 중단');el('progress').value=done/total;el('percent').textContent=`${(100*done/total).toFixed(1)}% · ${done.toLocaleString()} / ${total.toLocaleString()}바이트`;}
    });
    if (cancelled) throw new Error('사용자가 백업을 중단했습니다.');
    backup=result;el('phase').textContent='백업 검증 완료 · BIN 저장 버튼을 눌러 주세요';
    log(`원본과 MD5 일치: ${result.md5}`);log(`SHA-256: ${result.sha256}`);
  } catch(error) {
    el('phase').textContent=cancelled?'백업 중단 · 검증된 BIN 없음':`백업 실패: ${error.message}`;
    log(el('phase').textContent);
    log('자동 부트로더 연결에 실패하면 BOOT를 누른 채 EN/RESET을 한 번 누르는 방법을 확인하세요. 기존 펌웨어 업로드는 필요하지 않습니다.');
  } finally {
    if (loader && !cancelled) {
      try {await loader.after('hard_reset');log('기존 펌웨어 재시작 요청');}
      catch(error) {log(`재시작 요청 실패: ${error.message} · 부하 전원이 꺼진 상태에서 USB를 다시 연결하세요.`);}
    }
    if (transport) {try {await transport.disconnect();}catch(error){log(`USB 종료: ${error.message}`);}}
    transport=null;loader=null;running=false;el('ready').checked=false;render();
  }
});
el('stop').addEventListener('click',async()=>{
  if (!running || cancelled) return;
  cancelled=true;el('phase').textContent='백업 중단·USB 종료 중';render();
  try {await transport?.disconnect();}catch(error){log(error.message);}
  log('중단 후에는 부하 전원이 꺼진 상태에서 USB를 다시 연결해 기존 펌웨어를 재시작하세요.');
});
el('saveBin').addEventListener('click',()=>{
  if (backup && !running) download(backup.data,`AquaControl-B-firmware-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.bin`,'application/octet-stream');
});
el('saveReport').addEventListener('click',()=>download(report(),`AquaControl-B-firmware-backup-report-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`,'text/plain;charset=utf-8'));
if (!navigator.serial || !isSecureContext) el('phase').textContent='Windows의 최신 Edge 또는 Chrome에서 열어 주세요. USB 접근을 제한하는 브라우저 정책에서는 사용할 수 없습니다.';
render();
