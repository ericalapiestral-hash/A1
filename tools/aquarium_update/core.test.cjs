const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {prepareImages,checkImage,restrictWrites,updateBoard}=require('./core.js');
const hash=(kind,bytes)=>crypto.createHash(kind).update(bytes).digest('hex');
const hashes={md5:bytes=>hash('md5',bytes),sha256:async bytes=>hash('sha256',bytes)};
function espImage(data) {
 const offset=32,end=offset+data.length,checksum=end+15-(end%16);
 const image=new Uint8Array(checksum+33);image[0]=0xe9;image[1]=1;image[23]=1;
 const view=new DataView(image.buffer);view.setUint32(24,0x3ffbdb60,true);view.setUint32(28,data.length,true);image.set(data,32);
 let crc=0xef;for(const byte of data)crc^=byte;image[checksum]=crc;
 image.set(crypto.createHash('sha256').update(image.slice(0,checksum+1)).digest(),checksum+1);
 return image;
}
function fixture() {
 const originalData=new Uint8Array(256);originalData.set([2,4,6,8,10,12],16);
 const original=espImage(originalData),backup=new Uint8Array(4194304).fill(255);backup.set(original,0x10000);
 const table=new DataView(backup.buffer);table.setUint16(0x8000,0x50aa,true);table.setUint8(0x8002,0);table.setUint32(0x8004,0x10000,true);table.setUint32(0x8008,0x300000,true);
 const data=new Uint8Array(128);data.set(new TextEncoder().encode('AQUA_A_PEER_V1'),16);
 const template=espImage(data);
 const manifest={backupSha256:hash('sha256',backup),templateSha256:hash('sha256',template),originalAppSha256:hash('sha256',original),originalAppMd5:hash('md5',original),peerConfigOffset:48,originalPeerOffset:0x10000+48};
 return {backup,template,manifest};
}
function board(f) {
 const current=f.backup.slice();
 return {chip:{CHIP_NAME:'ESP32',readMac:async()=> '02:04:06:08:0a:0c'},IS_STUB:true,secureDownloadMode:false,current,commands:[],writes:[],secure:0,crypt:0,
  async main(){return 'ESP32 mock';},async detectFlashSize(){return '4MB';},
  async readReg(addr){return addr===0x3ff5a018?this.secure:this.crypt;},
  async command(op,data){this.commands.push([op,data]);return 0;},
  async flashMd5sum(addr,size){return hash('md5',this.current.slice(addr,addr+size));},
  async writeFlash(options){
   assert.equal(options.eraseAll,false);assert.equal(options.fileArray.length,1);assert.equal(options.fileArray[0].address,0x10000);
   const {data,address}=options.fileArray[0];assert.ok(data instanceof Uint8Array);
   const payload=new Uint8Array(16),view=new DataView(payload.buffer);view.setUint32(0,data.length,true);view.setUint32(12,address,true);
   await this.command(0x10,payload);this.writes.push({address,data:data.slice()});
   this.current.set(data,address);options.reportProgress(0,data.length,data.length);
  }
 };
}
test('personalization preserves original sender only in prepared bytes and verifies the rebuilt image',async()=>{
 const f=fixture(),images=await prepareImages(f.backup,f.template,f.manifest,hashes);
 assert.deepEqual(images.personalized.slice(80,86),Uint8Array.from([2,4,6,8,10,12]));
 assert.deepEqual(f.template.slice(80,86),new Uint8Array(6));
 await checkImage(images.personalized,hashes.sha256);
 assert.deepEqual(images.original,f.backup.slice(0x10000,0x10000+images.original.length));
});
test('wrong backup, damaged template and damaged ESP image are rejected before hardware writes',async()=>{
 const f=fixture();const wrong=f.backup.slice();wrong[1]^=1;
 await assert.rejects(prepareImages(wrong,f.template,f.manifest,hashes),/원본 백업/);
 const damaged=f.template.slice();damaged[40]^=1;
 await assert.rejects(prepareImages(f.backup,damaged,f.manifest,hashes),/무결성/);
 await assert.rejects(checkImage(damaged,hashes.sha256),/체크섬/);
 const brokenHash=f.template.slice();brokenHash[brokenHash.length-1]^=1;
 await assert.rejects(checkImage(brokenHash,hashes.sha256),/SHA-256/);
});
test('verified install and restore write only app0 and preserve all other backup bytes',async()=>{
 const f=fixture(),images=await prepareImages(f.backup,f.template,f.manifest,hashes),loader=board(f);let binding;
 const result=await updateBoard(loader,images,'install',{...hashes,onVerified:value=>binding=value});
 assert.equal(result.md5,images.newMd5);assert.deepEqual(loader.current.slice(0,0x10000),f.backup.slice(0,0x10000));
 assert.deepEqual(loader.current.slice(0x310000),f.backup.slice(0x310000));
 await updateBoard(loader,images,'restore',{...hashes,binding});
 assert.equal(hash('md5',loader.current.slice(0x10000,0x10000+images.original.length)),images.originalMd5);
 assert.equal(loader.writes.length,2);assert.ok(loader.writes.every(w=>w.address===0x10000));
});
test('another firmware or another chip cannot be changed',async()=>{
 const f=fixture(),images=await prepareImages(f.backup,f.template,f.manifest,hashes);
 const wrong=board(f);wrong.current[0x10000+10]^=1;
 await assert.rejects(updateBoard(wrong,images,'install',hashes),/B보드 펌웨어가 아닙니다/);assert.equal(wrong.writes.length,0);
 const different=board(f);different.chip.CHIP_NAME='ESP32-C3';
 await assert.rejects(updateBoard(different,images,'install',hashes),/일반 ESP32/);assert.equal(different.writes.length,0);
});
test('saved target identity permits recovery after an interrupted app write, never on another device',async()=>{
 const f=fixture(),images=await prepareImages(f.backup,f.template,f.manifest,hashes),loader=board(f);let binding;
 loader.writeFlash=async()=>{loader.current[0x10001]^=1;throw new Error('interrupted write');};
 await assert.rejects(updateBoard(loader,images,'install',{...hashes,onVerified:value=>binding=value}),/interrupted/);
 const wrong=board(f);wrong.current[0x10001]^=1;wrong.chip.readMac=async()=> '12:14:16:18:1a:1c';
 await assert.rejects(updateBoard(wrong,images,'restore',{...hashes,binding}),/B보드 펌웨어가 아닙니다/);assert.equal(wrong.writes.length,0);
 loader.writeFlash=board(f).writeFlash;
 await updateBoard(loader,images,'restore',{...hashes,binding});
 assert.equal(hash('md5',loader.current.slice(0x10000,0x10000+images.original.length)),images.originalMd5);
});
test('secure boot, flash encryption or wrong partition stops before programming',async()=>{
 const f=fixture(),images=await prepareImages(f.backup,f.template,f.manifest,hashes);
 for(const mode of ['secure','crypt','partition']){
  const loader=board(f);
  if(mode==='secure')loader.secure=0x10;
  if(mode==='crypt')loader.crypt=1<<20;
  if(mode==='partition')loader.current[0x8004]^=1;
  await assert.rejects(updateBoard(loader,images,'install',hashes));assert.equal(loader.writes.length,0);
 }
});
test('protocol guard denies writes before validation, whole erase and all non-app addresses',()=>{
 const loader=board(fixture()),guard=restrictWrites(loader),payload=new Uint8Array(16),view=new DataView(payload.buffer);
 view.setUint32(0,512,true);view.setUint32(12,0x10000,true);
 assert.throws(()=>loader.command(0x10,payload),/확인 전/);
 guard.enable();
 for(const address of [0,0x1000,0x8000,0x9000,0x310000]){view.setUint32(12,address,true);assert.throws(()=>loader.command(0x10,payload),/앱 영역 외/);}
 assert.throws(()=>loader.command(0xd0),/삭제/);assert.throws(()=>loader.command(0xd1),/삭제/);assert.throws(()=>loader.eraseFlash(),/전체 삭제/);
 guard.disable();view.setUint32(12,0x10000,true);assert.throws(()=>loader.command(0x10,payload),/확인 전/);
 assert.equal(loader.commands.length,0);
});
