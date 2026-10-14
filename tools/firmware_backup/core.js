// Flash contents are read only. ESP bootloader commands and a temporary RAM
// stub are needed; this is distinct from passive serial log capture.
const forbiddenFlashCommands = new Set([0x02,0x03,0x04,0x10,0x11,0x12,0xd0,0xd1]);
function guardFlashWrites(loader) {
  const command=loader.command.bind(loader);
  loader.command=(op,...args)=>{
    if (forbiddenFlashCommands.has(op)) throw new Error('이 도구는 플래시 쓰기·삭제 명령을 허용하지 않습니다.');
    return command(op,...args);
  };
  for (const name of ['writeFlash','eraseFlash','eraseRegion','flashBegin','flashBlock','flashFinish','flashDeflBegin','flashDeflBlock','flashDeflFinish']) {
    loader[name]=()=>{throw new Error('펌웨어 쓰기·삭제 기능은 제공하지 않습니다.');};
  }
}
function backupSize(label) {
  const match=/^(\d+)(KB|MB)$/.exec(label||'');
  if (!match) throw new Error('플래시 용량을 자동 확인하지 못했습니다. 임의 용량으로 백업하지 않습니다.');
  const size=Number(match[1])*(match[2]==='MB'?1048576:1024);
  if (!Number.isSafeInteger(size) || size<524288 || size>16777216) throw new Error('지원 용량은 512KB~16MB입니다.');
  return size;
}
async function readFirmwareBackup(loader,{md5,sha256,onPhase=()=>{},onProgress=()=>{}}) {
  guardFlashWrites(loader);
  onPhase('보드 연결·임시 RAM 읽기 도구 준비');
  const description=await loader.main();
  if (loader.chip?.CHIP_NAME!=='ESP32' || !loader.IS_STUB || loader.secureDownloadMode) {
    throw new Error('현재 도구는 일반 ESP32의 플래시 읽기만 지원합니다. 보안 모드·다른 칩에서는 중단합니다.');
  }
  onPhase('플래시 용량·원본 체크섬 확인');
  const label=await loader.detectFlashSize();
  const size=backupSize(label);
  // Compute the checksum on the board before reading. This also avoids making
  // another command while readFlash's trailing checksum packet is still pending.
  const expected=(await loader.flashMd5sum(0,size)).toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(expected)) throw new Error('원본 플래시 체크섬을 확인하지 못했습니다.');
  onPhase('원본 플래시 읽는 중 · 몇 분 소요될 수 있습니다');
  let progress=0;onProgress(0,size);
  const data=await loader.readFlash(0,size,(_packet,done,total)=>{
    if (total!==size || !Number.isInteger(done) || done<progress || done>size) throw new Error('백업 수신 길이가 일치하지 않습니다.');
    progress=done;onProgress(done,size);
  });
  if (!(data instanceof Uint8Array) || data.length!==size) throw new Error('전체 플래시를 받지 못했습니다. 불완전한 BIN은 저장하지 않습니다.');
  onPhase('원본과 수신 파일 체크섬 비교');
  const actual=md5(data).toLowerCase();
  if (actual!==expected) throw new Error('보드 원본과 백업의 MD5가 다릅니다. 불완전한 BIN은 저장하지 않습니다.');
  const hash=await sha256(data);
  return {description,chip:'ESP32',size,label,data,md5:actual,sha256:hash};
}
if (typeof module!=='undefined') module.exports={guardFlashWrites,backupSize,readFirmwareBackup};
