// Browser/Node shared, read-only serial log interpretation. No port writes.
class DiagnosticBuffer {
  constructor() {
    this.decoder = new TextDecoder();
    this.bytes = 0; this.frames = 0; this.discarded = 0; this.sensorLines = 0;
    this.text = ''; this.line = ''; this.frame = '';
    this.depth = 0; this.arrays = 0; this.quoted = false; this.escaped = false;
    this.lastSyntax = ''; this.lastReceived = null; this.lastJson = null;
    this.values = {ph:null, turb:null, lux:null, level:null, pump1:null, pump2:null, heater:null};
    this.units = {turb:null, lux:null};
    this.pins = {25:null, 26:null, 27:null};
  }
  pushBytes(bytes) {
    this.bytes += bytes.byteLength;
    this.consume(this.decoder.decode(bytes, {stream:true}));
  }
  pushText(text) {
    this.bytes += new TextEncoder().encode(text).byteLength;
    this.consume(text);
  }
  loadLog(text) {
    // Saved report metadata is not serial input or new JSON telemetry.
    this.pushText(serialLogText(text));
    if (this.line) { this.parseLine(this.line); this.line = ''; }
  }
  beginSession() {
    if (this.frame) this.discarded++;
    this.decoder = new TextDecoder(); this.line = ''; this.resetFrame();
    this.lastReceived = null; this.lastJson = null;
    for (const key of Object.keys(this.values)) this.values[key] = null;
    for (const key of Object.keys(this.units)) this.units[key] = null;
    for (const key of Object.keys(this.pins)) this.pins[key] = null;
  }
  consume(text) {
    if (!text) return;
    this.lastReceived = Date.now();
    this.text = (this.text + text).slice(-262144);
    for (const c of text) {
      if (c === '\n') { this.parseLine(this.line); this.line = ''; }
      else this.line = (this.line + c).slice(-8192);
      if (this.depth === 0) {
        if (c !== '{') continue;
        this.frame = ''; this.quoted = false; this.escaped = false; this.lastSyntax = '';
      } else if (!this.quoted && c === '{' && this.depth === 1 && this.arrays === 0 && this.lastSyntax !== ':') {
        this.discarded++; this.resetFrame();
      }
      this.frame += c;
      if (this.frame.length > 8192) { this.discarded++; this.resetFrame(); continue; }
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (c === '\\') this.escaped = true;
        else if (c === '"') this.quoted = false;
      } else {
        if (c === '"') this.quoted = true;
        else if (c === '{') this.depth++;
        else if (c === '}') this.depth--;
        else if (c === '[') this.arrays++;
        else if (c === ']') this.arrays--;
        if (!/\s/.test(c)) this.lastSyntax = c;
      }
      if (this.depth === 0) {
        try {
          const value = JSON.parse(this.frame);
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            this.frames++; this.lastJson = value; this.apply(value);
          }
        } catch (_) { this.discarded++; }
        this.resetFrame();
      }
    }
  }
  resetFrame() { this.frame=''; this.depth=0; this.arrays=0; this.quoted=false; this.escaped=false; this.lastSyntax=''; }
  apply(j) {
    // Temperature is intentionally not part of the current system.
    for (const key of ['ph','turb','lux']) {
      if (Object.hasOwn(j,key) && j[key] === null) {
        this.values[key] = null;
        if (Object.hasOwn(this.units,key)) this.units[key] = null;
      } else if (typeof j[key] === 'number' && Number.isFinite(j[key])) {
        this.values[key] = j[key];
        // A bare JSON number does not establish V, NTU or percent.
        if (Object.hasOwn(this.units,key)) this.units[key] = null;
      }
    }
    if (Object.hasOwn(j,'level') && j.level === null) this.values.level = null;
    else if (j.level === 0 || j.level === 1) this.values.level = j.level;
    else if (flag(j.water_low) !== null) this.values.level = flag(j.water_low) ? 0 : 1;
    for (const [field, key, alias] of [['pump1','pump1On','sup'],['pump2','pump2On','cir'],['heater','heaterOn','ht']]) {
      const value = flag(j[key] ?? j[alias]);
      if (value !== null) this.values[field] = value;
    }
    if (j.sensorOnline === false) {
      for (const key of ['ph','turb','lux','level']) this.values[key] = null;
      for (const key of Object.keys(this.units)) this.units[key] = null;
    }
  }
  parseLine(line) {
    // Existing Aquarium A firmware emits one complete ASCII status line, not JSON.
    const number = '([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))';
    const aquarium = line.match(new RegExp(`^\\s*pH=${number}\\(${number}V\\)\\s*\\|\\s*탁도=${number}V\\s*\\|\\s*수위낮음=([01])\\s*\\|\\s*급수=([01])\\s*\\|\\s*순환=([01])\\s*$`));
    if (aquarium && aquarium.slice(1,4).every(x=>Number.isFinite(Number(x)))) {
      this.values.ph = Number(aquarium[1]);
      this.values.turb = Number(aquarium[3]); this.units.turb = 'V';
      this.values.level = aquarium[4] === '1' ? 0 : 1;
      this.values.pump1 = aquarium[5] === '1';
      this.values.pump2 = aquarium[6] === '1';
      this.sensorLines++;
      return;
    }
    let sensorLine = false;
    const states = line.match(/\bon P1:([01]) P2:([01]) H:([01])/);
    if (states) [this.values.pump1,this.values.pump2,this.values.heater] = states.slice(1).map(x=>x==='1');
    for (const pin of [25,26,27]) {
      const match = line.match(new RegExp(`pin${pin}:([01])\\b`));
      if (match) this.pins[pin] = Number(match[1]);
    }
    const level = line.match(/\blvl:([01])\s+haveData:([01])/);
    if (level) {
      this.values.level = level[2] === '1' ? Number(level[1]) : null;
      if (level[2] === '0') for (const key of ['ph','turb','lux']) this.values[key] = null;
    }
    const ph = line.match(/pH\s+D34:.*?pH\s+([\d.+-]+)/);
    if (ph && Number.isFinite(Number(ph[1]))) { this.values.ph = Number(ph[1]); sensorLine = true; }
    const light = line.match(/조도\s+D33:.*?->\s*([\d.+-]+)%/);
    if (light && Number.isFinite(Number(light[1]))) { this.values.lux = Number(light[1]); this.units.lux = '%'; sensorLine = true; }
    const turb = line.match(/탁도\s+D32:.*?->\s*[\d.+-]+V\s*->\s*([\d.+-]+) NTU/);
    if (turb && Number.isFinite(Number(turb[1]))) { this.values.turb = Number(turb[1]); this.units.turb = 'NTU'; sensorLine = true; }
    const water = line.match(/수위\s+D35:\s*[01]\s*->\s*(정상|부족)/);
    if (water) { this.values.level = water[1] === '정상' ? 1 : 0; sensorLine = true; }
    if (sensorLine) this.sensorLines++;
  }
}
function serialLogText(text) {
  const withoutBom = text.replace(/^\uFEFF/,'');
  if (!/^AquaControl 보드 점검 보고서\r?\n/.test(withoutBom)) return text;
  const marker = /\r?\n--- 수신 로그 \(최근 최대 262144 문자\) ---\r?\n/.exec(withoutBom);
  return marker ? withoutBom.slice(marker.index + marker[0].length) : text;
}
function flag(value) { return value === true || value === 1 ? true : value === false || value === 0 ? false : null; }
function usbDescription(info={}) {
  const vid = info.usbVendorId ?? info.vendorId;
  const pid = info.usbProductId ?? info.productId;
  if (!Number.isInteger(vid) || !Number.isInteger(pid)) return 'USB ID를 제공하지 않는 포트';
  const hex = n => n.toString(16).toUpperCase().padStart(4,'0');
  const known = {'10C4:EA60':'Silicon Labs CP210x','1A86:7523':'WCH CH340/CH341','1A86:55D4':'WCH USB-UART','0403:6001':'FTDI USB-UART'};
  return `${known[hex(vid)+':'+hex(pid)] || (vid===0x303a ? 'Espressif USB' : 'USB 장치')} · VID ${hex(vid)} / PID ${hex(pid)}`;
}
if (typeof module !== 'undefined') module.exports = {DiagnosticBuffer,flag,usbDescription};
