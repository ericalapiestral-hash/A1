const APP_OFFSET=0x10000,APP_LIMIT=0x300000;
const originalCommands=new WeakMap();
function imageLayout(bytes,base=0) {
  if (!(bytes instanceof Uint8Array) || base+24>bytes.length || bytes[base]!==0xe9 || bytes[base+1]<1 || bytes[base+1]>16) throw new Error('유효한 ESP32 이미지가 아닙니다.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint16(base+12,true)!==0)throw new Error('일반 ESP32 대상 이미지가 아닙니다.');
  let pos=base+24,checksum=0xef;const segments=[];
  for(let i=0;i<bytes[base+1];i++) {
    if(pos+8>bytes.length)throw new Error('이미지가 잘렸습니다.');
    const address=view.getUint32(pos,true),length=view.getUint32(pos+4,true);pos+=8;
    if(length>APP_LIMIT || pos+length>bytes.length)throw new Error('잘못된 이미지 구간입니다.');
    segments.push({address,start:pos,length});
    for(let p=pos;p<pos+length;p++)checksum^=bytes[p];pos+=length;
  }
  const checksumOffset=pos+15-((pos-base)%16),hashOffset=checksumOffset+1;
  const end=hashOffset+(bytes[base+23]===1?32:0);
  if(end>bytes.length || bytes[checksumOffset]!==checksum)throw new Error('ESP 이미지 체크섬이 맞지 않습니다.');
  return {segments,checksumOffset,hashOffset,end,hasHash:bytes[base+23]===1};
}
async function checkImage(bytes,sha256,base=0) {
  const layout=imageLayout(bytes,base);
  if(layout.hasHash) {
    const expected=Array.from(bytes.slice(layout.hashOffset,layout.end),b=>b.toString(16).padStart(2,'0')).join('');
    if(await sha256(bytes.slice(base,layout.hashOffset))!==expected)throw new Error('ESP 이미지 SHA-256이 맞지 않습니다.');
  }
  return layout;
}
async function personalize(template,meta,peer,sha256,supplyPolarity=0) {
  if(await sha256(template)!==meta.templateSha256)throw new Error('배포 펌웨어의 무결성이 맞지 않습니다.');
  const personalized=template.slice(),layout=await checkImage(personalized,sha256);
  const marker=new TextEncoder().encode('AQUA_A_PEER_V1'),start=meta.peerConfigOffset;
  if(!Number.isInteger(start) || start<24 || start+40>personalized.length || !layout.segments.some(s=>start>=s.start && start+40<=s.start+s.length))throw new Error('송신 보드 설정 위치가 잘못됐습니다.');
  if(!marker.every((v,i)=>personalized[start+i]===v) || personalized.slice(start+marker.length,start+40).some(v=>v!==0))throw new Error('송신 보드 설정 템플릿이 잘못됐습니다.');
  personalized.set(peer,start+32);
  if(meta.manualSupply)personalized[start+38]=supplyPolarity;
  let checksum=0xef;
  for(const segment of layout.segments)for(let p=segment.start;p<segment.start+segment.length;p++)checksum^=personalized[p];
  personalized[layout.checksumOffset]=checksum;
  if(layout.hasHash) {
    const hash=await sha256(personalized.slice(0,layout.hashOffset));
    personalized.set(Uint8Array.from(hash.match(/../g),x=>parseInt(x,16)),layout.hashOffset);
  }
  await checkImage(personalized,sha256);
  if(personalized.length>APP_LIMIT)throw new Error('앱 파티션 크기를 넘었습니다.');
  return personalized;
}
async function prepareImages(backup,template,manifest,{sha256,md5},previousTemplates=[],supplyPolarity=0) {
  if(backup.length!==4194304 || await sha256(backup)!==manifest.backupSha256)throw new Error('분석한 B보드의 4MB 원본 백업 파일을 선택해 주세요.');
  if(await sha256(template)!==manifest.templateSha256)throw new Error('배포 펌웨어의 무결성이 맞지 않습니다.');
  const originalLayout=await checkImage(backup,sha256,APP_OFFSET);
  const original=backup.slice(APP_OFFSET,originalLayout.end);
  if(await sha256(original)!==manifest.originalAppSha256 || md5(original)!==manifest.originalAppMd5)throw new Error('원본 앱 영역이 분석한 B보드와 다릅니다.');
  // Partition metadata must retain app0 at 0x10000, 3MB, no OTA slot changes.
  const table=new DataView(backup.buffer,backup.byteOffset+0x8000,0x1000);
  let matched=false;
  for(let p=0;p<0x1000;p+=32)if(table.getUint16(p,true)===0x50aa && table.getUint8(p+2)===0 && table.getUint32(p+4,true)===APP_OFFSET && table.getUint32(p+8,true)===APP_LIMIT)matched=true;
  if(!matched)throw new Error('현재 B의 app0 파티션 배치와 다릅니다.');
  if(!Number.isInteger(manifest.originalPeerOffset) || manifest.originalPeerOffset<0 || manifest.originalPeerOffset+6>backup.length)throw new Error('원래 A보드 송신 필터 위치가 잘못됐습니다.');
  const peer=backup.slice(manifest.originalPeerOffset,manifest.originalPeerOffset+6);
  if(peer.length!==6 || peer.every(v=>v===0) || peer.every(v=>v===255))throw new Error('원래 A보드 송신 필터를 읽지 못했습니다.');
  if(![0,1,2].includes(supplyPolarity))throw new Error('급수 펌프의 현재 상태를 확인해 선택해 주세요.');
  const personalized=await personalize(template,manifest,peer,sha256,supplyPolarity);
  const acceptedApps=[original,personalized];
  if(manifest.manualSupply)for(const polarity of [1,2])acceptedApps.push(await personalize(template,manifest,peer,sha256,polarity));
  const previousMeta=manifest.previousTemplates||[];
  if(previousMeta.length!==previousTemplates.length)throw new Error('이전 버전 복구 이미지가 누락됐습니다.');
  const previous=[];
  for(let i=0;i<previousMeta.length;i++)previous.push(await personalize(previousTemplates[i],previousMeta[i],peer,sha256));
  acceptedApps.push(...previous);
  if(original.length>APP_LIMIT)throw new Error('앱 파티션 크기를 넘었습니다.');
  return {original,personalized,rollback:previous[0]||null,acceptedApps:acceptedApps.map(data=>({length:data.length,md5:md5(data)})),supplyRequired:!!manifest.manualSupply,supplyPolarity,originalMd5:md5(original),newMd5:md5(personalized),partitionMd5:md5(backup.slice(0x8000,0x9000)),backupSha256:manifest.backupSha256};
}
function restrictWrites(loader) {
  let allow=false,opened=false;
  if(!originalCommands.has(loader))originalCommands.set(loader,loader.command.bind(loader));
  const original=originalCommands.get(loader);
  loader.command=(op,data,...rest)=>{
    if(op===0xd0 || op===0xd1)throw new Error('전체 플래시·임의 영역 삭제는 허용하지 않습니다.');
    if([2,3,4,16,17,18].includes(op)) {
      if(!allow)throw new Error('대상 확인 전에는 플래시에 쓰지 않습니다.');
      if(op===2 || op===16) {
        if(!(data instanceof Uint8Array) || data.length<16)throw new Error('잘못된 앱 쓰기 요청입니다.');
        const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
        const size=view.getUint32(0,true),address=view.getUint32(12,true);
        if(address!==APP_OFFSET || size<1 || size>APP_LIMIT)throw new Error('앱 영역 외 쓰기는 허용하지 않습니다.');
        opened=true;
      } else if(!opened)throw new Error('검증된 앱 영역에만 쓸 수 있습니다.');
    }
    return original(op,data,...rest);
  };
  loader.eraseFlash=()=>{throw new Error('전체 삭제는 제공하지 않습니다.');};
  return {enable:()=>{allow=true;},disable:()=>{allow=false;opened=false;}};
}
async function updateBoard(loader,images,operation,{sha256,md5,binding=null,onVerified=()=>{},onPhase=()=>{},onProgress=()=>{}}) {
  if(!['install','restore','rollback'].includes(operation))throw new Error('알 수 없는 작업입니다.');
  if(operation==='install' && images.supplyRequired && ![1,2].includes(images.supplyPolarity))throw new Error('급수 펌프의 현재 상태를 확인해 선택해 주세요.');
  if(operation==='rollback' && !images.rollback)throw new Error('순환 v1.0.1 복구 이미지가 없습니다.');
  const guard=restrictWrites(loader);
  try {
    onPhase('B보드 부트로더 연결');await loader.main();
    if(loader.chip?.CHIP_NAME!=='ESP32' || !loader.IS_STUB || loader.secureDownloadMode)throw new Error('일반 ESP32 B보드가 아닙니다.');
    if(await loader.detectFlashSize()!=='4MB')throw new Error('분석한 4MB B보드와 용량이 다릅니다.');
    const secure=await loader.readReg(0x3ff5a018),crypt=await loader.readReg(0x3ff5a000);
    if((secure&0x30)!==0 || (crypt&0x07f00000)!==0)throw new Error('보안 부팅·플래시 암호화 설정이 있는 보드는 이 도구로 갱신하지 않습니다.');
    const mac=(await loader.chip.readMac(loader)).toLowerCase().replace(/:/g,'');
    if(!/^[a-f0-9]{12}$/.test(mac))throw new Error('보드 식별 정보를 확인하지 못했습니다.');
    const macHash=await sha256(new TextEncoder().encode(mac));
    onPhase('원본 펌웨어·파티션·연결 보드 확인');
    if((await loader.flashMd5sum(0x8000,0x1000)).toLowerCase()!==images.partitionMd5)throw new Error('원래 B보드의 파티션과 다릅니다.');
    let firmwareMatches=false;
    for(const app of images.acceptedApps)if((await loader.flashMd5sum(APP_OFFSET,app.length)).toLowerCase()===app.md5){firmwareMatches=true;break;}
    const previouslyVerified=binding?.backupSha256===images.backupSha256 && binding?.macHash===macHash;
    if(!firmwareMatches && !previouslyVerified)throw new Error('이 백업의 B보드 펌웨어가 아닙니다. A보드나 다른 보드에는 쓰지 않습니다.');
    const verified={backupSha256:images.backupSha256,macHash};onVerified(verified);
    const data=operation==='restore'?images.original:operation==='rollback'?images.rollback:images.personalized;
    const expected=md5(data);
    onPhase(operation==='restore'?'원본 B 프로그램 복원 중':operation==='rollback'?'순환 v1.0.1 복원 중':'급수 수동 제어 프로그램 업데이트 중');
    guard.enable();
    await loader.writeFlash({fileArray:[{data,address:APP_OFFSET}],flashSize:'keep',flashMode:'keep',flashFreq:'keep',eraseAll:false,compress:true,calculateMD5Hash:md5,reportProgress:onProgress});
    guard.disable();onPhase('쓴 앱 영역 체크섬 검증');
    if((await loader.flashMd5sum(APP_OFFSET,data.length)).toLowerCase()!==expected)throw new Error('기록 후 체크섬이 다릅니다. 같은 화면에서 원본 복원을 선택할 수 있습니다.');
    return {operation,size:data.length,md5:expected,sha256:await sha256(data),binding:verified};
  } finally {guard.disable();}
}
if(typeof module!=='undefined')module.exports={imageLayout,checkImage,prepareImages,restrictWrites,updateBoard};
