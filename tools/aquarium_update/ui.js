const byId=id=>document.getElementById(id);
const hashes={md5:bytes=>SparkMD5.ArrayBuffer.hash(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),sha256:async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('')};
let images=null,busy=false,loader=null,transport=null,result=null,logText='',binding=null;
const storageKey='aquarium-circulation-updater-1.0-target';
try {binding=JSON.parse(localStorage.getItem(storageKey)||'null');}catch(_){}
function log(text){logText=(logText+String(text)+'\n').slice(-65536);byId('log').value=logText;byId('log').scrollTop=byId('log').scrollHeight;}
function render(){byId('start').disabled=busy||!images||!byId('ready').checked||!navigator.serial||!isSecureContext;byId('backup').disabled=busy;byId('operation').disabled=busy;byId('ready').disabled=busy;byId('save').disabled=busy;}
byId('ready').addEventListener('change',render);
byId('backup').addEventListener('change',async event=>{
  images=null;result=null;render();const file=event.target.files[0];if(!file)return;
  try {
    if(file.size!==4194304)throw new Error('기존 4MB B보드 BIN 백업을 선택해 주세요.');
    byId('phase').textContent='백업·배포 펌웨어 검증 중';
    const backup=new Uint8Array(await file.arrayBuffer());
    const template=Uint8Array.from(atob(AQUARIUM_IMAGE_BASE64),c=>c.charCodeAt(0));
    images=await prepareImages(backup,template,AQUARIUM_MANIFEST,hashes);
    byId('phase').textContent='백업 확인 완료 · B보드 포트를 선택할 수 있습니다';
    log('원본 백업·ESP 이미지 검증 완료. 기존 A 송신 필터를 브라우저 안에서 새 프로그램에 복사했습니다.');
  } catch(error){byId('phase').textContent=error.message;log(error.message);}
  render();
});
byId('start').addEventListener('click',async()=>{
  if(busy||!images||!byId('ready').checked)return;
  busy=true;result=null;byId('progress').value=0;render();let success=false;
  try {
    byId('phase').textContent='B보드 포트 선택 · 현재 COM5';
    const port=await navigator.serial.requestPort();
    transport=new AquaBackupVendor.Transport(port,false);
    loader=new AquaBackupVendor.ESPLoader({transport,baudrate:115200,romBaudrate:115200,terminal:{clean:()=>{},writeLine:log,write:log},debugLogging:false});
    result=await updateBoard(loader,images,byId('operation').value,{
      ...hashes,binding,
      onVerified:value=>{binding=value;try{localStorage.setItem(storageKey,JSON.stringify(value));}catch(_){log('브라우저가 대상 기록 저장을 제한합니다. 오류가 나면 이 화면을 닫기 전에 원본 복원을 진행하세요.');}},
      onPhase:text=>{byId('phase').textContent=text;log(text);},
      onProgress:(_file,done,total)=>{byId('progress').value=total?done/total:0;byId('percent').textContent=`${total?(100*done/total).toFixed(1):0}%`;}
    });
    await loader.after('hard_reset');success=true;
    byId('phase').textContent=result.operation==='restore'?'원본 복원·체크섬 확인 완료':'업데이트·체크섬 확인 완료 · 앱을 다시 연결해 순환을 확인하세요';
    log(byId('phase').textContent);log(`앱 영역 MD5: ${result.md5}`);
  } catch(error) {
    byId('phase').textContent=`중단: ${error.message}`;log(byId('phase').textContent);
    log('기록이 시작된 뒤 실패한 경우, 같은 화면에서 “원본 B 프로그램 복원”을 선택해 다시 진행할 수 있습니다.');
  } finally {
    if(transport){try{await transport.disconnect();}catch(error){log(error.message);}}
    transport=null;loader=null;busy=false;byId('ready').checked=false;render();
    if(!success)log('펌프·히터 전원은 꺼둔 상태로 보고서를 저장하세요.');
  }
});
byId('save').addEventListener('click',()=>{
  const report='\uFEFFAquaControl Aquarium B 업데이트 보고서 v1.0.1\n'+
    `작성: ${new Date().toISOString()}\n상태: ${byId('phase').textContent}\n작업: ${byId('operation').value}\n`+
    `결과: ${JSON.stringify(result)}\n검증된 대상 기록: ${JSON.stringify(binding)}\n\n--- 진행 로그 ---\n${logText}`;
  const url=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='AquaControl-B-update-report-'+new Date().toISOString().replace(/[:.]/g,'-')+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
if(!navigator.serial||!isSecureContext)byId('phase').textContent='최신 Windows Edge 또는 Chrome에서 열어 주세요.';
render();
