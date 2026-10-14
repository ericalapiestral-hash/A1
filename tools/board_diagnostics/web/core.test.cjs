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
 assert.equal(d.frames,1);assert.equal(d.discarded,2);assert.equal(d.values.level,0);assert.equal(d.values.heater,false);assert.equal(d.values.pump2,false);
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
test('fragmented Aquarium ASCII reports low water and pump flags without inventing a heater',()=>{
 const d=new DiagnosticBuffer();
 const bytes=new TextEncoder().encode('pH=9.65(1.174V) | 탁도=3.118V | 수위낮음=1 | 급수=1 | 순환=1\r\n');
 for (const byte of bytes) d.pushBytes(Uint8Array.of(byte));
 assert.equal(d.values.ph,9.65);assert.equal(d.values.turb,3.118);assert.equal(d.units.turb,'V');
 assert.equal(d.values.level,0);assert.equal(d.values.pump1,true);assert.equal(d.values.pump2,true);
 assert.equal(d.values.heater,null);assert.equal(d.values.lux,null);assert.equal(d.frames,0);assert.equal(d.sensorLines,1);
 d.pushText('pH=7.25(1.600V) | 탁도=2.500V | 수위낮음=0 | 급수=0 | 순환=0\n');
 assert.equal(d.values.level,1);assert.equal(d.values.pump1,false);assert.equal(d.values.pump2,false);assert.equal(d.sensorLines,2);
});
test('boot messages and malformed Aquarium lines do not establish current output or sensor state',()=>{
 const d=new DiagnosticBuffer();
 d.pushText('[ESP-NOW] 수신 대기\n[BLE] advertising \'Aquarium\'\n[REFILL] 시작\n');
 d.pushText('pH=NaN(1.174V) | 탁도=3.118V | 수위낮음=1 | 급수=1 | 순환=1\n');
 d.pushText('pH=9.65(1.174V) | 탁도=3.118V | 수위낮음=2 | 급수=1 | 순환=1\n');
 assert.equal(d.values.ph,null);assert.equal(d.values.pump1,null);assert.equal(d.values.heater,null);assert.equal(d.sensorLines,0);
});
test('saved report imports parse only raw serial and handle the last line without a newline',()=>{
 const d=new DiagnosticBuffer();
 const raw='pH=9.65(1.174V) | 탁도=3.118V | 수위낮음=1 | 급수=1 | 순환=1';
 d.loadLog('\uFEFFAquaControl 보드 점검 보고서\r\n보고된 센서/출력: {"ph":1,"heaterOn":true}\r\n보고된 GPIO: {"25":1}\r\n\r\n--- 수신 로그 (최근 최대 262144 문자) ---\r\n'+raw);
 assert.equal(d.values.ph,9.65);assert.equal(d.values.heater,null);assert.equal(d.pins[25],null);
 assert.equal(d.frames,0);assert.equal(d.sensorLines,1);assert.equal(d.text,raw);assert.equal(d.bytes,new TextEncoder().encode(raw).length);
});
test('units follow explicit ASCII labels and are cleared for bare JSON or a new board',()=>{
 const d=new DiagnosticBuffer();
 d.pushText('pH=9.65(1.174V) | 탁도=3.118V | 수위낮음=1 | 급수=1 | 순환=1\n');
 d.pushText('{"turb":3.12,"lux":50}');assert.equal(d.units.turb,null);assert.equal(d.units.lux,null);
 d.pushText('\n탁도  D32: raw 2000 -> 2.42V -> 3000 NTU\n조도  D33: raw 2000 -> 49%\n');
 assert.equal(d.units.turb,'NTU');assert.equal(d.values.turb,3000);assert.equal(d.units.lux,'%');
 d.beginSession();assert.equal(d.units.turb,null);assert.equal(d.units.lux,null);assert.equal(d.values.turb,null);
});
test('Aquarium circulation JSON uses the observed inverse signal while explicit output and ASCII remain semantic',()=>{
 const d=new DiagnosticBuffer();
 d.pushText('{"cir":0,"sup":0,"ht":0}');
 assert.equal(d.values.pump2,true);assert.equal(d.values.pump1,false);assert.equal(d.values.heater,false);
 d.pushText('{"cir":1}');assert.equal(d.values.pump2,false);
 d.pushText('{"pump2On":true,"cir":1}');assert.equal(d.values.pump2,true);
 d.pushText('{"pump2On":false,"cir":0}');assert.equal(d.values.pump2,false);
 d.pushText('\npH=9.65(1.174V) | 탁도=3.118V | 수위낮음=1 | 급수=1 | 순환=1\n');
 assert.equal(d.values.pump2,true);
});
