const test=require('node:test');
const assert=require('node:assert/strict');
const {DiagnosticBuffer,usbDescription}=require('./core.js');
test('fragmented UTF8, strings, nested objects and object arrays remain valid',()=>{
 const d=new DiagnosticBuffer();
 const bytes=new TextEncoder().encode('{"ph":7.25,"note":"수조 } { \\\"","nested":{"ok":true},"array":[{"x":1},{"x":2}]}');
 for (const byte of bytes) d.pushBytes(Uint8Array.of(byte));
 assert.equal(d.frames,1);assert.equal(d.discarded,0);assert.equal(d.values.ph,7.25);assert.equal(d.bytes,bytes.length);
 assert.deepEqual(d.lastJson.array,[{x:1},{x:2}]);
});
test('the actual truncated Aquarium prefixes recover at the next root JSON',()=>{
 const d=new DiagnosticBuffer();
 d.pushText('{"online":1,"ph":9.7{"online":1,"ph":9.6{"ph":9.70,"turb":3.12,"water_low":1,"ht":0,"sup":0,"cir":1}');
 assert.equal(d.frames,1);assert.equal(d.discarded,2);assert.equal(d.values.level,0);assert.equal(d.values.heater,false);assert.equal(d.values.pump2,true);
});
test('serial output mode and pin levels are not confused with actual reported ON',()=>{
 const d=new DiagnosticBuffer();d.pushText('[상태] mode P1:2 P2:2 H:1 | on P1:0 P2:1 H:1 | pin25:1 pin26:0 pin27:0 | lvl:0 haveData:1\n');
 assert.equal(d.values.pump1,false);assert.equal(d.values.pump2,true);assert.equal(d.values.heater,true);assert.equal(d.values.level,0);assert.equal(d.pins[25],1);
});
test('offline/null sensors clear old readings and temperature never becomes a sensor',()=>{
 const d=new DiagnosticBuffer();d.pushText('{"ph":7,"turb":2,"lux":50,"level":1,"temp":25}');
 d.pushText('{"sensorOnline":false,"ph":null,"turb":null,"lux":null,"level":null}');
 assert.equal(d.values.ph,null);assert.equal(d.values.level,null);assert.equal(Object.hasOwn(d.values,'temp'),false);
});
test('a new port session cannot join unfinished frames or retain old board state',()=>{
 const d=new DiagnosticBuffer();d.pushText('{"ph":7}{"ph":');d.beginSession();d.pushText('{"water_low":1}');
 assert.equal(d.values.ph,null);assert.equal(d.values.level,0);assert.equal(d.discarded,1);assert.equal(d.frames,2);
});
test('log/frame limits and USB identification are bounded and explicit',()=>{
 const d=new DiagnosticBuffer();d.pushText('x'.repeat(300000));assert.equal(d.text.length,262144);
 d.pushText('{"note":"'+'x'.repeat(9000));d.pushText('{"ph":8}');assert.equal(d.values.ph,8);assert.ok(d.discarded>0);
 assert.match(usbDescription({usbVendorId:0x10c4,usbProductId:0xea60}),/CP210x/);
 assert.match(usbDescription({usbVendorId:0x1a86,usbProductId:0x7523}),/CH340/);
 assert.match(usbDescription(),/제공하지/);
});
