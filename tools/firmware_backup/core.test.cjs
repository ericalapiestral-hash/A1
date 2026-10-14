const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {guardFlashWrites,backupSize,readFirmwareBackup}=require('./core.js');
const digest=(algorithm,data)=>crypto.createHash(algorithm).update(data).digest('hex');
const options={md5:data=>digest('md5',data),sha256:async data=>digest('sha256',data)};
function engine() {
 const data=new Uint8Array(1048576);data[0x1000]=0xe9;
 return {chip:{CHIP_NAME:'ESP32'},IS_STUB:true,secureDownloadMode:false,data,calls:[],
  async command(op){this.calls.push(op);return 0;},
  async main(){await this.command(0x08);await this.command(0x05);return 'ESP32-D0WD';},
  async detectFlashSize(){return '1MB';},
  async flashMd5sum(addr,size){assert.equal(addr,0);assert.equal(size,this.data.length);await this.command(0x13);return digest('md5',this.data);},
  async readFlash(addr,size,cb){assert.equal(addr,0);assert.equal(size,this.data.length);await this.command(0xd2);cb(this.data,size,size);return this.data.slice();}
 };
}
test('verified full backup preserves exact bytes and board checksum',async()=>{
 const loader=engine();const progress=[];
 const result=await readFirmwareBackup(loader,{...options,onProgress:(n,total)=>progress.push([n,total])});
 assert.deepEqual(result.data,loader.data);assert.equal(result.size,1048576);
 assert.equal(result.sha256,digest('sha256',loader.data));assert.equal(result.md5,digest('md5',loader.data));
 assert.deepEqual(loader.calls,[0x08,0x05,0x13,0xd2]);assert.deepEqual(progress,[[0,1048576],[1048576,1048576]]);
});
test('flash erase and programming are denied at method and protocol levels',()=>{
 const loader=engine();guardFlashWrites(loader);
 for(const op of [0x02,0x03,0x04,0x10,0x11,0x12,0xd0,0xd1])assert.throws(()=>loader.command(op),/허용하지/);
 for(const name of ['writeFlash','eraseFlash','eraseRegion','flashBegin','flashBlock','flashFinish','flashDeflBegin','flashDeflBlock','flashDeflFinish'])assert.throws(()=>loader[name](),/제공하지/);
 assert.deepEqual(loader.calls,[]);
});
test('unknown or unsafe flash capacities do not become a guessed backup size',()=>{
 assert.equal(backupSize('4MB'),4194304);assert.equal(backupSize('512KB'),524288);
 for(const label of [undefined,'4 MB','auto','256KB','32MB','-4MB'])assert.throws(()=>backupSize(label));
});
test('unsupported chip or security mode stops before flash read',async()=>{
 for(const change of [{chip:{CHIP_NAME:'ESP32-C3'}},{secureDownloadMode:true},{IS_STUB:false}]){
  const loader=Object.assign(engine(),change);
  loader.readFlash=()=>{throw new Error('should not read');};
  await assert.rejects(readFirmwareBackup(loader,options),/일반 ESP32/);
  assert.deepEqual(loader.calls,[0x08,0x05]);
 }
});
test('partial or corrupted data cannot become a verified BIN',async()=>{
 const partial=engine();partial.readFlash=async()=>new Uint8Array(10);
 await assert.rejects(readFirmwareBackup(partial,options),/전체 플래시/);
 const corrupted=engine();corrupted.readFlash=async()=>{const data=corrupted.data.slice();data[10]^=1;return data;};
 await assert.rejects(readFirmwareBackup(corrupted,options),/MD5가 다릅니다/);
});
test('bad progress or an invalid board checksum aborts instead of offering a download',async()=>{
 const loader=engine();loader.readFlash=async(_a,size,cb)=>{cb(new Uint8Array(1),size+1,size);return loader.data;};
 await assert.rejects(readFirmwareBackup(loader,options),/수신 길이/);
 const invalid=engine();invalid.flashMd5sum=async()=>'no checksum';
 await assert.rejects(readFirmwareBackup(invalid,options),/체크섬/);
});
