const byId = id => document.getElementById(id);
let model = new DiagnosticBuffer();
let activePort=null, reader=null, readTask=null, busy=false, closing=false;
let serialIdentity='선택 전', usbIdentity='선택 전', phase='연결 전';
const note = value => { byId('message').textContent=value; };
function render() {
  byId('phase').textContent = phase;
  byId('bytes').textContent = model.bytes.toLocaleString('ko-KR');
  byId('frames').textContent = `${model.frames} / ${model.discarded}`;
  byId('sensorLines').textContent = `문자 센서 상태 ${model.sensorLines}줄`;
  byId('last').textContent = model.lastReceived ? new Date(model.lastReceived).toLocaleTimeString('ko-KR') : '수신 없음';
  byId('serialIdentity').textContent=serialIdentity;
  byId('usbIdentity').textContent=usbIdentity;
  for (const key of ['ph','turb','lux']) {
    const unit=model.units[key];
    byId(key).textContent=model.values[key]===null?'미수신':model.values[key].toFixed(unit==='V'?3:unit==='%'?0:2)+(unit?' '+unit:'');
  }
  byId('turbLabel').textContent=model.units.turb==='V'?'탁도 센서 신호 전압':model.units.turb==='NTU'?'탁도 · NTU':'탁도 · 단위 미확인';
  byId('luxLabel').textContent=model.units.lux==='%'?'상대 조도 · %':'조도 · 단위 미확인';
  byId('level').textContent=model.values.level===null?'미수신':model.values.level===1?'정상':'부족';
  for (const key of ['pump1','pump2','heater']) {
    const val=model.values[key]; byId(key).textContent=val===null?'미수신':val?'보드 ON':'보드 OFF';
  }
  byId('pins').textContent=[25,26,27].map(p=>`IO${p}: ${model.pins[p]===null?'미수신':model.pins[p]}`).join('   ');
  const area=byId('log'); const atEnd=area.scrollHeight-area.scrollTop-area.clientHeight<60;
  if (area.value!==model.text) { area.value=model.text; if (atEnd) area.scrollTop=area.scrollHeight; }
  byId('connect').disabled=busy || !!activePort || !navigator.serial || !isSecureContext;
  byId('disconnect').disabled=busy || !activePort;
  byId('baud').disabled=busy || !!activePort;
  byId('import').disabled=busy || !!activePort;
  // A no-output/driver problem still needs an exportable diagnostic report.
  byId('save').disabled=false;
  if (activePort && model.lastReceived && Date.now()-model.lastReceived>10000) byId('last').textContent+=' · 10초 이상 새 수신 없음';
}
async function refreshPorts() {
  if (!navigator.serial || !isSecureContext) {
    byId('ports').textContent='이 환경에서는 USB 시리얼을 사용할 수 없습니다.';
    note('Windows PC의 최신 Microsoft Edge 또는 Chrome에서 열어 주세요. 보안 정책이 USB 시리얼을 제한하는 PC에서는 관리자 확인이 필요합니다.');
    render(); return;
  }
  try {
    const ports=await navigator.serial.getPorts();
    byId('ports').textContent=`이 화면에 접근을 허용한 포트 ${ports.length}개 · 전체 선택 목록은 “포트 선택·연결”에서 확인`;
  } catch(error) { note(`포트 목록을 읽지 못했습니다: ${error.message}`); }
}
async function connectPort() {
  if (busy || activePort) return;
  busy=true; phase='포트 선택 중'; render();
  let port;
  try {
    port=await navigator.serial.requestPort();
    phase='연결 중'; render();
    await port.open({baudRate:Number(byId('baud').value), dataBits:8, stopBits:1, parity:'none', flowControl:'none', bufferSize:4096});
    activePort=port; serialIdentity=usbDescription(port.getInfo());
    model.beginSession();
    model.text += `\n[PC 연결 기록] ${byId('board').value} / ${serialIdentity} / ${new Date().toISOString()}\n`;
    try { await port.setSignals({dataTerminalReady:false,requestToSend:false}); }
    catch(_) { note('포트가 열렸습니다. 이 장치는 DTR/RTS 설정을 지원하지 않습니다.'); }
    phase='USB 시리얼 연결됨';
    note('로그를 읽고 있습니다. 휴대폰 앱에서 BLE 연결 후 새 로그가 나오는지 확인하세요. 출력이 없어도 보드 고장으로 단정할 수 없습니다.');
    readTask=readLoop(port); await refreshPorts();
  } catch(error) {
    phase='연결 전';
    if (error.name==='NotFoundError') note('포트 선택을 마치지 않았습니다. 목록이 비어 있었다면 데이터 케이블·USB 포트·Windows 드라이버 인식을 확인하세요.');
    else note(`연결 실패: ${error.message} · 다른 프로그램이 같은 포트를 사용 중인지 확인하세요.`);
    if (port && !activePort) { try { await port.close(); } catch(_) {} }
  } finally { busy=false; render(); }
}
async function readLoop(port) {
  try {
    if (!port.readable) throw new Error('읽기 스트림을 열지 못했습니다.');
    reader=port.readable.getReader();
    while (activePort===port && !closing) {
      const {value,done}=await reader.read();
      if (done) break;
      if (value) model.pushBytes(value);
      render();
    }
  } catch(error) {
    if (!closing) note(`수신 중단: ${error.message} · USB 연결을 확인하고 다시 연결하세요.`);
  } finally {
    if (reader) { reader.releaseLock(); reader=null; }
    if (!closing && activePort===port) {
      try { await port.close(); } catch(_) {}
      activePort=null; phase='연결 끊김'; render();
    }
  }
}
async function disconnectPort() {
  if (!activePort || busy) return;
  busy=true;closing=true;phase='연결 종료 중';render();
  const port=activePort;
  try {
    if (reader) await reader.cancel();
    if (readTask) await readTask;
    await port.close();
    note('USB 시리얼 연결을 닫았습니다. 수신한 로그는 화면에 남아 있습니다.');
  } catch(error) { note(`연결 종료: ${error.message}`); }
  finally {activePort=null;readTask=null;closing=false;busy=false;phase='연결 전';render();}
}
function report() {
  return '\uFEFFAquaControl 보드 점검 보고서\n'+
    `점검 프로그램: v1.2\n작성: ${new Date().toISOString()}\n보드 선택(사용자 입력): ${byId('board').value}\nCOM 번호(사용자 입력): ${byId('com').value || '미입력'}\n`+
    `시리얼 장치: ${serialIdentity}\n별도 선택 USB 장치: ${usbIdentity}\n속도: ${byId('baud').value} baud\n상태: ${phase}\n`+
    `브라우저: ${navigator.userAgent}\nWeb Serial 지원: ${!!navigator.serial}\n보안 컨텍스트: ${isSecureContext}\n`+
    `수신 바이트: ${model.bytes}\n완전한 JSON: ${model.frames}\n폐기 JSON: ${model.discarded}\n문자 센서 상태 줄: ${model.sensorLines}\n`+
    '수온 표시·사용: 안 함 (실제 펌웨어의 센서 제거 여부는 미확인)\n보고된 센서/출력: '+JSON.stringify(model.values)+'\n로그상 단위: '+JSON.stringify(model.units)+'\n보고된 GPIO: '+JSON.stringify(model.pins)+'\n'+
    'Aquarium 순환 신호 해석: cir=0 → ON, cir=1 → OFF. pump2On·문자 순환 값은 명시적 ON/OFF로 해석합니다.\n'+
    '보드 보고 상태는 실제 펌프 회전·히터 가열 확인과 다릅니다. 이 도구는 시리얼 읽기만 수행합니다.\n'+
    '\n--- 수신 로그 (최근 최대 262144 문자) ---\n'+model.text;
}
byId('connect').addEventListener('click',connectPort);
byId('disconnect').addEventListener('click',disconnectPort);
byId('refresh').addEventListener('click',refreshPorts);
byId('usb').addEventListener('click',async()=>{
  if (!navigator.usb || !isSecureContext) {note('이 브라우저에서는 별도 USB 장치 식별을 지원하지 않습니다. Windows 장치 관리자에서 하드웨어 ID를 확인하세요.');return;}
  try {
    // Identification only: do not open/claim an interface or transfer data.
    const device=await navigator.usb.requestDevice({filters:[]});
    usbIdentity=usbDescription(device);render();
    note('선택한 USB 장치의 ID입니다. 이 정보만으로 COM 드라이버 설치나 B보드 연결이 확인되지는 않습니다.');
  } catch(error) {note(error.name==='NotFoundError'?'USB 장치 선택을 마치지 않았습니다.':`USB 식별: ${error.message}`);}
});
byId('save').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([report()],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='AquaControl-board-log-'+new Date().toISOString().replace(/[:.]/g,'-')+'.txt';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
byId('clear').addEventListener('click',()=>{model.text='';note('화면의 원문 로그를 지웠습니다. 센서·수신 통계는 유지합니다.');render();});
byId('import').addEventListener('change',async event=>{
  const file=event.target.files[0];if (!file) return;
  if (file.size>4*1024*1024) {note('로그 파일은 4MB 이하로 선택해 주세요.');event.target.value='';return;}
  if (activePort) {note('USB 연결을 닫은 후 로그 파일을 열어 주세요.');event.target.value='';return;}
  model=new DiagnosticBuffer();model.loadLog(await file.text());serialIdentity='로그 파일: '+file.name;phase='저장 로그 분석';note('파일의 시리얼 원문을 분석했습니다. 문자 형식만 출력하는 보드는 JSON 수가 0이어도 정상 수신일 수 있습니다. 현재 보드의 실시간 상태와는 구분해 주세요.');render();event.target.value='';
});
if (navigator.serial) {
  navigator.serial.addEventListener('connect',refreshPorts);
  navigator.serial.addEventListener('disconnect',event=>{
    const port=event.port||event.target;
    if (port===activePort) {note('USB 장치가 분리되었습니다.');disconnectPort();}
    refreshPorts();
  });
}
setInterval(render,1000);
refreshPorts();render();
