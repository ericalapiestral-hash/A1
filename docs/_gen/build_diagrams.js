// 배선도 생성기 — A보드/B보드 SVG를 회로기호(분압저항·커패시터)까지 자세히 그림.
// 실행: node docs/_gen/build_diagrams.js   → docs/*.svg + docs/_gen/*_wrap.html 생성
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..');      // docs/
const GEN = __dirname;                           // docs/_gen/

// ---- 팔레트 ----
const C = {
  v5: '#d4453b', v33: '#e8893c', gnd: '#4b5563', sig: '#2f6fb0', cap: '#7c3aed',
  box: '#f9fafb', boxStroke: '#cbd5e1', ink: '#111827', mute: '#6b7280',
  ok: '#1f6b43', warn: '#b0291f', accent: '#0f4c81', pale: '#eef2f7'
};
const FONT = "font-family=\"'Malgun Gothic','Segoe UI',system-ui,sans-serif\"";

// ---- 헬퍼 ----
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function T(x,y,s,{size=12,fill=C.ink,anchor='start',weight=400}={}) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;
}
function wire(pts, color, w=2.6) {
  return `<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
const dot = (x,y,color,r=4.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
// 세로 저항 (박스형), 중심 x, 상단 y, 높이 h
function resV(x, y, h, label) {
  return `<rect x="${x-23}" y="${y}" width="46" height="${h}" rx="5" fill="#fff" stroke="${C.ink}" stroke-width="1.4"/>`
       + T(x, y+h/2+4, label, {size:12, anchor:'middle', weight:600});
}
// 세로 커패시터, 중심 x, 상단 y (점유 높이 30)
function capV(x, y, label, polar=false) {
  let s = `<line x1="${x}" y1="${y}" x2="${x}" y2="${y+11}" stroke="${C.cap}" stroke-width="2.4"/>`
        + `<line x1="${x-12}" y1="${y+11}" x2="${x+12}" y2="${y+11}" stroke="${C.cap}" stroke-width="2.8"/>`;
  if (polar) s += `<path d="M ${x-9} ${y+19} q 9 6 18 0" fill="none" stroke="${C.cap}" stroke-width="2.4"/>`;
  else        s += `<line x1="${x-12}" y1="${y+18}" x2="${x+12}" y2="${y+18}" stroke="${C.cap}" stroke-width="2.8"/>`;
  s += `<line x1="${x}" y1="${y+(polar?22:18)}" x2="${x}" y2="${y+30}" stroke="${C.cap}" stroke-width="2.4"/>`;
  s += T(x+18, y+20, label, {size:11, fill:C.cap, weight:600});
  return s;
}
function ioTag(x, y, label) { // 신호 핀 태그 (좌측에 점 연결)
  const w = 62;
  return `<rect x="${x}" y="${y-15}" width="${w}" height="30" rx="6" fill="${C.sig}"/>`
       + T(x+w/2, y+5, label, {size:14, fill:'#fff', anchor:'middle', weight:700});
}

// ================= A 보드 =================
function buildA() {
  const W=1760, H=690;
  const rail5=118, rail33=156, gndY=600, rx0=60, rx1=1690;
  const chs = [
    {name:'수온', model:'DS18B20', io:'IO4',  rail:'33', type:'ds'},
    {name:'조도', model:'GL5528',  io:'IO33', rail:'33', type:'ldr', r2:'10kΩ', cap:'0.1µF'},
    {name:'탁도', model:'SEN0189', io:'IO32', rail:'5',  type:'div', r1:'10kΩ', r2:'20kΩ', cap:'0.1µF'},
    {name:'pH',  model:'PH4502C', io:'IO34', rail:'5',  type:'div', r1:'10kΩ', r2:'20kΩ', cap:'1µF'},
    {name:'수위', model:'XKC-Y25-V', io:'IO35', rail:'5', type:'div', r1:'10kΩ', r2:'20kΩ', digital:true},
  ];
  const x0=300, x1=1720, cw=(x1-x0)/5;
  const cx = i => Math.round(x0 + cw*i + cw/2);

  let s = '';
  // 배경/제목
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
  s += T(40, 42, 'A보드 배선도 — 브레드보드 + 확장보드 (전원/GND 버스 + 필터 커패시터)', {size:23, weight:700});
  s += T(40, 68, '전원·GND를 한 줄짜리 레일(버스)로 정리 · 5V 센서는 분압(10k+20k)·아날로그 노드마다 커패시터로 ADC 노이즈 제거 · 아날로그 전부 ADC1', {size:13.5, fill:C.mute});

  // 레일
  s += `<rect x="${rx0}" y="${rail5}" width="${rx1-rx0}" height="13" rx="6" fill="${C.v5}"/>` + T(rx1+8, rail5+11, '5V 레일', {size:13, fill:C.v5, weight:700});
  s += `<rect x="${rx0}" y="${rail33}" width="${rx1-rx0}" height="13" rx="6" fill="${C.v33}"/>` + T(rx1+8, rail33+11, '3.3V 레일', {size:13, fill:C.v33, weight:700});
  s += `<rect x="${rx0}" y="${gndY}" width="${rx1-rx0}" height="13" rx="6" fill="${C.gnd}"/>` + T(rx1+8, gndY+11, 'GND 레일', {size:13, fill:C.gnd, weight:700});
  s += T(rx0+4, gndY+30, 'GND 레일(버스) — 모든 센서·분압·커패시터·ESP32 공통 1점 접지', {size:12, fill:C.mute});

  // ESP32 + 확장보드
  const ex=36, ey=210, ew=212, eh=380;
  s += `<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" rx="12" fill="${C.pale}" stroke="#94a3b8" stroke-width="1.6"/>`;
  s += T(ex+ew/2, ey+30, 'ESP32', {size:17, anchor:'middle', weight:700});
  s += T(ex+ew/2, ey+50, '+ GPIO 확장보드', {size:12.5, anchor:'middle', fill:C.mute});
  // 전원 출력 → 레일
  const pY=ey+86;
  s += dot(ex+ew, pY, C.v5)   + T(ex+ew-12, pY+4, '5V',  {size:12, anchor:'end'});
  s += dot(ex+ew, pY+34, C.v33)+ T(ex+ew-12, pY+38, '3V3', {size:12, anchor:'end'});
  s += dot(ex+ew, pY+68, C.gnd)+ T(ex+ew-12, pY+72, 'GND', {size:12, anchor:'end'});
  s += wire([[ex+ew,pY],[268,pY],[268,rail5+6],[rx0,rail5+6]], C.v5);
  s += wire([[ex+ew,pY+34],[280,pY+34],[280,rail33+6],[rx0,rail33+6]], C.v33);
  s += wire([[ex+ew,pY+68],[292,pY+68],[292,gndY+6],[rx0,gndY+6]], C.gnd);
  // 레일 디커플링 커패시터
  s += capV(ex+22, ey+eh-150, '', true);
  s += wire([[ex+22, ey+eh-120],[ex+22, ey+eh-96]], C.gnd, 1.6);
  s += T(ex+44, ey+eh-152, '10µF+0.1µF', {size:10.5, fill:C.cap});
  s += T(ex+44, ey+eh-137, '레일 디커플링', {size:10.5, fill:C.cap});
  // 신호핀 안내
  s += T(ex+ew/2, ey+eh-70, '신호핀: IO4 · IO33 · IO32', {size:11.5, anchor:'middle', fill:C.sig, weight:600});
  s += T(ex+ew/2, ey+eh-52, 'IO34 · IO35 (모두 ADC1)', {size:11.5, anchor:'middle', fill:C.sig, weight:600});
  s += T(ex+ew/2, ey+eh-30, '파란 태그(IOxx) = 해당', {size:10.5, anchor:'middle', fill:C.mute});
  s += T(ex+ew/2, ey+eh-14, 'ESP32 핀으로 신호선', {size:10.5, anchor:'middle', fill:C.mute});

  // 채널
  for (let i=0;i<chs.length;i++){
    const c=chs[i], X=cx(i);
    const railY = c.rail==='5'?rail5:rail33;
    const railColor = c.rail==='5'?C.v5:C.v33;
    // 센서 박스
    const by=246, bh=94, bw=164;
    // 전원선: 레일 → 센서 VCC
    s += dot(X-46, railY+6, railColor) + wire([[X-46, railY+6],[X-46, by]], railColor);
    // 센서 GND → GND 레일
    s += wire([[X-58, by+bh],[X-58, gndY+6]], C.gnd, 1.8) + dot(X-58, gndY+6, C.gnd);
    s += `<rect x="${X-bw/2}" y="${by}" width="${bw}" height="${bh}" rx="9" fill="${C.box}" stroke="${C.boxStroke}" stroke-width="1.4"/>`;
    s += T(X, by+32, c.name, {size:16, anchor:'middle', weight:700, fill:C.accent});
    s += T(X, by+54, c.model, {size:12.5, anchor:'middle', fill:C.mute});
    s += T(X-46, by-6, c.rail==='5'?'VCC→5V':'VCC→3.3V', {size:10.5, anchor:'middle', fill:railColor});
    s += T(X-58, gndY-6, 'GND', {size:10, anchor:'middle', fill:C.mute});

    if (c.type==='div') {
      // OUT → R1 → node → R2 → GND ;  node → IO ;  node → cap → GND
      const outY=by+bh;
      const R1y=350, nodeY=438, R2y=470;
      s += wire([[X,outY],[X,R1y]], C.sig);
      s += resV(X, R1y, 44, c.r1);
      s += wire([[X,R1y+44],[X,nodeY]], C.sig);
      s += dot(X, nodeY, C.sig);
      // 신호
      s += wire([[X,nodeY],[X+62,nodeY]], C.sig) + ioTag(X+62, nodeY, c.io);
      // R2 to gnd
      s += wire([[X,nodeY],[X,R2y]], C.sig);
      s += resV(X, R2y, 44, c.r2);
      s += wire([[X,R2y+44],[X,gndY+6]], C.gnd) + dot(X, gndY+6, C.gnd);
      // cap
      if (c.cap){
        s += wire([[X,nodeY],[X-92,nodeY]], C.cap, 2);
        s += capV(X-92, nodeY+6, c.cap, true);
        s += wire([[X-92,nodeY+36],[X-92,gndY+6]], C.gnd, 1.8) + dot(X-92, gndY+6, C.gnd);
      }
      s += T(X, gndY-58, c.digital?'5V로직→3.3V 강하(디지털)':'분압 ×0.67 → 코드 ×1.5', {size:10.5, anchor:'middle', fill:C.mute});
    }
    else if (c.type==='ldr') {
      // 3.3V→LDR(센서)→node→10k→GND ; node→IO ; node→cap→GND
      const outY=by+bh, nodeY=420, R2y=452;
      s += wire([[X,outY],[X,nodeY]], C.sig) + dot(X, nodeY, C.sig);
      s += wire([[X,nodeY],[X+62,nodeY]], C.sig) + ioTag(X+62, nodeY, c.io);
      s += wire([[X,nodeY],[X,R2y]], C.sig);
      s += resV(X, R2y, 44, c.r2);
      s += wire([[X,R2y+44],[X,gndY+6]], C.gnd) + dot(X, gndY+6, C.gnd);
      s += wire([[X,nodeY],[X-92,nodeY]], C.cap, 2);
      s += capV(X-92, nodeY+6, c.cap, true);
      s += wire([[X-92,nodeY+36],[X-92,gndY+6]], C.gnd, 1.8) + dot(X-92, gndY+6, C.gnd);
      s += T(X, gndY-58, '3.3V–LDR–노드–10k–GND', {size:10.5, anchor:'middle', fill:C.mute});
    }
    else if (c.type==='ds') {
      // DATA→node→IO ; node→4.7k→3.3V(풀업) ; 0.1µF VCC-GND
      const outY=by+bh, nodeY=420;
      s += wire([[X,outY],[X,nodeY]], C.sig) + dot(X, nodeY, C.sig);
      s += wire([[X,nodeY],[X+62,nodeY]], C.sig) + ioTag(X+62, nodeY, c.io);
      // 풀업 4.7k → 3.3V 레일
      s += wire([[X,nodeY],[X-92,nodeY]], C.warn, 2);
      s += resV(X-92, 330, 44, '4.7kΩ');
      s += wire([[X-92,nodeY],[X-92,374]], C.warn, 2);
      s += wire([[X-92,330],[X-92,rail33+6]], C.v33) + dot(X-92, rail33+6, C.v33);
      s += T(X-92, 322, '풀업', {size:10, anchor:'middle', fill:C.warn});
      s += T(X, gndY-58, 'DATA–3.3V 4.7kΩ 풀업 필수', {size:10.5, anchor:'middle', fill:C.warn});
      s += T(X, gndY-42, '(없으면 −127℃) · VCC–GND 0.1µF 권장', {size:9.5, anchor:'middle', fill:C.mute});
    }
  }

  // 범례
  const ly=H-26;
  s += `<line x1="60" y1="${ly}" x2="92" y2="${ly}" stroke="${C.v5}" stroke-width="4"/>` + T(98, ly+4, '5V');
  s += `<line x1="150" y1="${ly}" x2="182" y2="${ly}" stroke="${C.v33}" stroke-width="4"/>` + T(188, ly+4, '3.3V');
  s += `<line x1="248" y1="${ly}" x2="280" y2="${ly}" stroke="${C.gnd}" stroke-width="4"/>` + T(286, ly+4, 'GND');
  s += `<line x1="350" y1="${ly}" x2="382" y2="${ly}" stroke="${C.sig}" stroke-width="4"/>` + T(388, ly+4, '신호(ADC)');
  s += `<rect x="490" y="${ly-9}" width="34" height="18" rx="4" fill="#fff" stroke="${C.ink}"/>` + T(534, ly+4, '저항(분압)');
  s += capV(640, ly-12, '', true) + T(660, ly+4, '커패시터', {fill:C.cap});
  s += dot(760, ly, C.sig) + T(772, ly+4, '연결 노드(여기에 커패시터)');

  return svgDoc(W,H,s);
}

// ================= B 보드 =================
function buildB() {
  const W=1420, H=810;
  let s='';
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
  s += T(40,42,'B보드 배선도 — 3채널 릴레이(LOW 트리거) · 공통 GND 버스 + 디커플링', {size:23, weight:700});
  s += T(40,68,'IO25=펌프1(급수) · IO26=펌프2(순환) · IO27=히터 · 산소는 핀 없는 로직 전용', {size:13.5, fill:C.mute});

  // ESP32
  const ex=40, ey=150, ew=180, eh=330;
  s += `<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" rx="12" fill="${C.pale}" stroke="#94a3b8" stroke-width="1.6"/>`;
  s += T(ex+ew/2, ey+30, 'ESP32', {size:16, anchor:'middle', weight:700});
  s += T(ex+ew/2, ey+50, 'WROOM-32', {size:12, anchor:'middle', fill:C.mute});
  const pins=[['5V',C.v5],['GND',C.gnd],['IO25',C.sig],['IO26',C.sig],['IO27',C.sig]];
  pins.forEach((p,i)=>{ const y=ey+92+i*46; s+= T(ex+ew-16, y+4, p[0], {anchor:'end', size:13}) + dot(ex+ew, y, p[1], 5); });
  s += T(ex+ew/2, ey+eh-16, 'USB 5V 상시급전', {size:10.8, anchor:'middle', fill:C.mute});

  // 릴레이 모듈
  const rx=470, ry=150, rw=300, rh=410;
  s += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="12" fill="${C.box}" stroke="${C.boxStroke}" stroke-width="1.6"/>`;
  s += T(rx+rw/2, ry+30, '3채널 릴레이 모듈', {size:16, anchor:'middle', weight:700});
  s += T(rx+rw/2, ry+50, 'LOW = ON', {size:12.5, anchor:'middle', fill:C.warn, weight:600});
  // 입력
  const inPins=[['VCC',C.v5,'전원'],['GND',C.gnd,'공통'],['IN1',C.sig,'펌프1'],['IN2',C.sig,'펌프2'],['IN3',C.sig,'히터']];
  inPins.forEach((p,i)=>{ const y=ey+92+i*46; s+= dot(rx, y, p[1],5) + T(rx+14, y+4, `${p[0]}  (${p[2]})`, {size:12.5}); });
  // ESP32 → 릴레이 배선
  const ey0=ey+92;
  s += wire([[ex+ew, ey0],[rx-30,ey0],[rx-30,ey0],[rx,ey0]], C.v5);          // 5V→VCC
  s += wire([[ex+ew, ey0+46],[rx-40,ey0+46],[rx-40,ey0+46],[rx,ey0+46]], C.gnd); // GND
  s += wire([[ex+ew, ey0+92],[rx,ey0+92]], C.sig);  // IO25→IN1
  s += wire([[ex+ew, ey0+138],[rx,ey0+138]], C.sig);
  s += wire([[ex+ew, ey0+184],[rx,ey0+184]], C.sig);
  // 디커플링
  s += capV(rx-70, ey0-4, '10µF+0.1µF', true);
  s += wire([[rx-70,ey0],[rx-70,ey0-4]], C.v5,1.4);
  s += wire([[rx-70,ey0+26],[rx-70,ey0+46]], C.gnd,1.6);
  s += T(rx-120, ey0-12, '디커플링', {size:10.5, fill:C.cap});
  // 채널 접점(우측)
  const chOut=[['CH1','펌프1 → 12V', C.ok], ['CH2','펌프2 → 12V', C.ok], ['CH3','히터 → 220V', C.warn]];
  chOut.forEach((c,i)=>{ const y=ry+rh-150+i*46; s+= dot(rx+rw, y, c[2],5) + T(rx+rw-14, y+4, `${c[0]} COM/NO`, {anchor:'end', size:12}); });

  // 부하
  function load(x,y,w,h,title,sub,lines,color){
    let g=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="${color}" stroke-width="1.5"/>`;
    g+=T(x+w/2,y+28,title,{size:14,anchor:'middle',weight:700,fill:color});
    g+=T(x+w/2,y+48,sub,{size:11.5,anchor:'middle',fill:C.mute});
    lines.forEach((l,i)=> g+=T(x+w/2,y+72+i*18,l,{size:11,anchor:'middle'}));
    return g;
  }
  const lx=860;
  s += load(lx,150,200,116,'펌프1 (급수)','SZH-PWAT-040 · 12V DC',['12V+ → COM1','NO1 → 펌프1(+)','12V− → 펌프1(−)'],C.ok);
  s += load(lx,290,200,116,'펌프2 (순환)','SZH-PWAT-040 · 12V DC',['12V+ → COM2','NO2 → 펌프2(+)','12V− → 펌프2(−)'],C.ok);
  s += load(lx,430,200,130,'히터 (220V)','HE-50W · 220V AC',['220V L → COM3','NO3 → 히터 L','220V N → 히터 N'],C.warn);
  // 릴레이 → 부하
  s += wire([[rx+rw, ry+rh-150],[lx-30,ry+rh-150],[lx-30,205],[lx,205]], C.ok);
  s += wire([[rx+rw, ry+rh-104],[lx-46,ry+rh-104],[lx-46,345],[lx,345]], C.ok);
  s += wire([[rx+rw, ry+rh-58],[lx-62,ry+rh-58],[lx-62,490],[lx,490]], C.warn);

  // 전원
  s += load(1090,150,290,116,'12V 어댑터','펌프1·펌프2 공급',['두 펌프 공용 시 전류 용량 확인','12V와 220V 배선 물리적 분리'],C.ink);
  s += load(1090,430,290,130,'⚠ 220V 콘센트','반드시 전원 뽑고 작업',['L/N 단자 절연·노출 금지','릴레이는 정격 2~3배 여유품'],C.warn);

  // GND 버스 강조
  s += `<rect x="40" y="582" width="1340" height="38" rx="8" fill="#eef7f0" stroke="#79b894"/>`;
  s += T(56, 606, '공통 GND 버스: ESP32 GND · 릴레이 GND 를 한 점으로 묶기 (전위 기준 일치 → 오동작 방지)', {size:12.5, fill:C.ok});

  // 범례 + 안전
  const ly=648;
  s += `<line x1="40" y1="${ly}" x2="72" y2="${ly}" stroke="${C.v5}" stroke-width="4"/>`+T(78,ly+4,'5V');
  s += `<line x1="130" y1="${ly}" x2="162" y2="${ly}" stroke="${C.gnd}" stroke-width="4"/>`+T(168,ly+4,'GND');
  s += `<line x1="230" y1="${ly}" x2="262" y2="${ly}" stroke="${C.sig}" stroke-width="4"/>`+T(268,ly+4,'신호(IOxx)');
  s += `<line x1="380" y1="${ly}" x2="412" y2="${ly}" stroke="${C.ok}" stroke-width="4"/>`+T(418,ly+4,'12V 부하');
  s += `<line x1="510" y1="${ly}" x2="542" y2="${ly}" stroke="${C.warn}" stroke-width="4"/>`+T(548,ly+4,'220V 부하');
  s += capV(650, ly-12, '', true)+T(670, ly+4, '디커플링', {fill:C.cap});

  s += `<rect x="40" y="${ly+30}" width="1340" height="110" rx="10" fill="#fff8e6" stroke="#e0b94a"/>`;
  s += T(56, ly+58, '안전·안정 체크', {size:13, weight:700, fill:'#8a6d1a'});
  s += T(56, ly+82, '· 코드 시작 시 전 채널 OFF, A보드 신호 15초 끊기면 히터 자동 OFF.   · 릴레이가 반대로 동작하면 코드 RELAY_LOW_TRIG=false.', {size:12.5});
  s += T(56, ly+104, '· 릴레이 VCC에 디커플링 커패시터(10µF/0.1µF) → 코일 ON/OFF 스파이크로 인한 ESP32 리셋/오동작 크게 감소.', {size:12.5});
  s += T(56, ly+126, '· 220V 배선은 반드시 전원(돼지코) 뽑은 상태에서. 12V·220V 배선 물리적 분리.', {size:12.5, fill:C.warn});

  return svgDoc(W,H,s);
}

// ================= A보드 Fritzing 스타일 결선도 (v2 — 교차 없음) =================
function buildAFritzingV1_unused() {
  const W = 1700, H = 1720;
  const V5='#d4453b', V33='#e8893c', GND_C='#1f2937', SIG='#fbbf24', SIG2='#10b981', SIG3='#3b82f6', SIG4='#ec4899', SIG5='#a855f7';
  let s = '';
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += T(40,42,'A보드 결선도 (Fritzing 스타일) — ESP32 + 브레드보드 + 센서 5개', {size:24, weight:700});
  s += T(40,72,'실제 부품·브레드보드·점퍼선 모양 그대로. 색 굵은 선이 점퍼선 길.', {size:13.5, fill:C.mute});

  // ============================ ESP32 38pin DevKit ============================
  const eX = 640, eY = 110, eW = 420, eH = 600;
  // PCB
  s += `<rect x="${eX}" y="${eY}" width="${eW}" height="${eH}" rx="10" fill="#1e3a5f" stroke="#0d2440" stroke-width="2"/>`;
  s += T(eX+eW/2, eY+22, 'ESP32-WROOM-32  DevKit (38pin)', {size:13, anchor:'middle', fill:'#a8c5e0', weight:700});

  // USB-C top
  s += `<rect x="${eX+eW/2-32}" y="${eY-22}" width="64" height="24" rx="3" fill="#555"/>`;
  s += `<rect x="${eX+eW/2-28}" y="${eY-18}" width="56" height="16" rx="2" fill="#333"/>`;
  s += T(eX+eW/2, eY-3, 'USB-C', {size:9, anchor:'middle', fill:'#fff'});

  // PCB antenna pattern
  const aX = eX+eW/2-55;
  s += `<rect x="${aX-5}" y="${eY+55}" width="120" height="32" fill="#1e3a5f"/>`;
  s += `<path d="M ${aX} ${eY+62} L ${aX+110} ${eY+62} L ${aX+110} ${eY+70} L ${aX+8} ${eY+70} L ${aX+8} ${eY+78} L ${aX+110} ${eY+78}" stroke="#c0c8d0" stroke-width="1.4" fill="none"/>`;

  // ESP32 metal can
  const mX = eX+eW/2-55, mY = eY+95;
  s += `<rect x="${mX}" y="${mY}" width="110" height="170" fill="#c0c8d0" stroke="#7a7a7a" stroke-width="1.5"/>`;
  s += T(mX+55, mY+90, 'ESP32', {size:13, anchor:'middle', fill:'#000', weight:700});
  s += T(mX+55, mY+108, 'WROOM-32', {size:10, anchor:'middle', fill:'#000'});

  // Boot/EN buttons
  s += `<rect x="${eX+22}" y="${eY+eH-50}" width="22" height="22" rx="3" fill="#1a1a1a"/>`;
  s += T(eX+33, eY+eH-32, 'BOOT', {size:8, anchor:'middle', fill:'#a8c5e0'});
  s += `<rect x="${eX+eW-44}" y="${eY+eH-50}" width="22" height="22" rx="3" fill="#1a1a1a"/>`;
  s += T(eX+eW-33, eY+eH-32, 'EN', {size:8, anchor:'middle', fill:'#a8c5e0'});

  // Pin headers (19 pins each side, standard DevKit V1)
  const leftPins  = ['3V3','EN','IO36','IO39','IO34','IO35','IO32','IO33','IO25','IO26','IO27','IO14','IO12','GND','IO13','SD2','SD3','CMD','5V'];
  const rightPins = ['GND','IO23','IO22','TX0','RX0','IO21','GND','IO19','IO18','IO5','IO17','IO16','IO4','IO0','IO2','IO15','SD1','SD0','CLK'];

  const pinSpace = 26, pinTop = eY+135;
  const lpX = eX+18, rpX = eX+eW-18;

  for (let i = 0; i < 19; i++) {
    const y = pinTop + i * pinSpace;
    // header strip
    s += `<rect x="${lpX-9}" y="${y-9}" width="18" height="18" fill="#222"/>`;
    s += `<circle cx="${lpX}" cy="${y}" r="4" fill="#d4a017" stroke="#7a5d05"/>`;
    s += T(lpX+16, y+4, leftPins[i], {size:10.5, anchor:'start', fill:'#fff', weight:600});

    s += `<rect x="${rpX-9}" y="${y-9}" width="18" height="18" fill="#222"/>`;
    s += `<circle cx="${rpX}" cy="${y}" r="4" fill="#d4a017" stroke="#7a5d05"/>`;
    s += T(rpX-16, y+4, rightPins[i], {size:10.5, anchor:'end', fill:'#fff', weight:600});
  }

  // Used pin positions (lookup)
  const usedL = (name) => ({ x: lpX, y: pinTop + leftPins.indexOf(name) * pinSpace });
  const usedR = (name) => ({ x: rpX, y: pinTop + rightPins.indexOf(name) * pinSpace });

  const P_3V3  = usedL('3V3');
  const P_5V   = usedL('5V');
  const P_GND  = usedL('GND');
  const P_IO34 = usedL('IO34');
  const P_IO35 = usedL('IO35');
  const P_IO32 = usedL('IO32');
  const P_IO33 = usedL('IO33');
  const P_IO4  = usedR('IO4');

  // ============================ Breadboard ============================
  const bbX = 60, bbY = 820, bbW = 1580, bbH = 460;
  s += `<rect x="${bbX}" y="${bbY}" width="${bbW}" height="${bbH}" rx="14" fill="#f5efe2" stroke="#b8a877" stroke-width="2"/>`;

  // Top power rails (+ red, - blue)
  const tprPosY = bbY + 28, tprNegY = bbY + 56;
  s += `<line x1="${bbX+22}" y1="${tprPosY}" x2="${bbX+bbW-22}" y2="${tprPosY}" stroke="#d4453b" stroke-width="3.5"/>`;
  s += `<line x1="${bbX+22}" y1="${tprNegY}" x2="${bbX+bbW-22}" y2="${tprNegY}" stroke="#1e3a8a" stroke-width="3.5"/>`;
  s += T(bbX+10, tprPosY+5, '+', {size:18, fill:'#d4453b', weight:700});
  s += T(bbX+10, tprNegY+5, '−', {size:18, fill:'#1e3a8a', weight:700});

  // Hole layout: 63 columns
  const colCount = 63, colSpace = 24, colStart = bbX+40;
  // Top rail holes
  for (let i = 0; i < colCount; i++) {
    const x = colStart + i * colSpace;
    s += `<circle cx="${x}" cy="${tprPosY}" r="2.4" fill="#1a1a1a"/>`;
    s += `<circle cx="${x}" cy="${tprNegY}" r="2.4" fill="#1a1a1a"/>`;
  }

  // Main strips: 5 rows top (a-e), gap, 5 rows bottom (f-j)
  const stripStartY = bbY + 100, rowSpace = 20;
  const rowsTop = 5;
  const gapY = stripStartY + rowsTop * rowSpace + 6;
  const rowsBot = 5;
  for (let r = 0; r < rowsTop; r++) {
    for (let c = 0; c < colCount; c++) {
      const x = colStart + c * colSpace;
      const y = stripStartY + r * rowSpace;
      s += `<circle cx="${x}" cy="${y}" r="2.2" fill="#a3a3a3"/>`;
    }
  }
  // Gap
  s += `<rect x="${bbX+22}" y="${gapY}" width="${bbW-44}" height="14" fill="#e6d9b6"/>`;
  for (let r = 0; r < rowsBot; r++) {
    for (let c = 0; c < colCount; c++) {
      const x = colStart + c * colSpace;
      const y = gapY + 20 + r * rowSpace;
      s += `<circle cx="${x}" cy="${y}" r="2.2" fill="#a3a3a3"/>`;
    }
  }

  // Bottom power rails
  const bprNegY = bbY + bbH - 56, bprPosY = bbY + bbH - 28;
  s += `<line x1="${bbX+22}" y1="${bprNegY}" x2="${bbX+bbW-22}" y2="${bprNegY}" stroke="#1e3a8a" stroke-width="3.5"/>`;
  s += `<line x1="${bbX+22}" y1="${bprPosY}" x2="${bbX+bbW-22}" y2="${bprPosY}" stroke="#d4453b" stroke-width="3.5"/>`;
  for (let i = 0; i < colCount; i++) {
    const x = colStart + i * colSpace;
    s += `<circle cx="${x}" cy="${bprNegY}" r="2.4" fill="#1a1a1a"/>`;
    s += `<circle cx="${x}" cy="${bprPosY}" r="2.4" fill="#1a1a1a"/>`;
  }

  // Helper: get hole position by column (0-62) and strip-row (0-4 top, 5-9 bot)
  const holeXY = (col, row) => {
    const x = colStart + col * colSpace;
    let y;
    if (row < 5) y = stripStartY + row * rowSpace;
    else         y = gapY + 20 + (row-5) * rowSpace;
    return [x, y];
  };

  // Bezier wire helper (Fritzing-style soft curves)
  function jumper(x1, y1, x2, y2, color, w=4) {
    // Hide first quarter via curve so it looks like over the board
    const cy = (y1+y2)/2;
    return `<path d="M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" opacity="0.95"/>`;
  }

  // ============================ Power rail feeds ============================
  // 3V3 → top + rail (column 2)
  {
    const [hx, hy] = [colStart + 2 * colSpace, tprPosY];
    s += jumper(P_3V3.x - 12, P_3V3.y, hx, hy - 4, V33, 4.5);
    s += `<circle cx="${hx}" cy="${hy}" r="3" fill="${V33}"/>`;
  }
  // But we need 5V on another rail. Use top − rail repurposed as 5V? Better: 5V goes to BOTTOM + rail.
  // 5V → bottom + rail (column 8)
  {
    const [hx, hy] = [colStart + 8 * colSpace, bprPosY];
    s += jumper(P_5V.x - 12, P_5V.y, hx, hy + 4, V5, 4.5);
    s += `<circle cx="${hx}" cy="${hy}" r="3" fill="${V5}"/>`;
  }
  // GND → top − rail (column 4) AND bottom − rail (column 14) via a connecting wire
  {
    const [hx, hy] = [colStart + 4 * colSpace, tprNegY];
    s += jumper(P_GND.x - 12, P_GND.y, hx, hy - 4, GND_C, 4.5);
    s += `<circle cx="${hx}" cy="${hy}" r="3" fill="${GND_C}"/>`;
  }
  // Bridge top − rail to bottom − rail (so both rails are GND)
  {
    const [hx1, hy1] = [colStart + 60 * colSpace, tprNegY];
    const [hx2, hy2] = [colStart + 60 * colSpace, bprNegY];
    s += `<line x1="${hx1}" y1="${hy1}" x2="${hx2}" y2="${hy2}" stroke="${GND_C}" stroke-width="3"/>`;
    s += `<circle cx="${hx1}" cy="${hy1}" r="3" fill="${GND_C}"/>`;
    s += `<circle cx="${hx2}" cy="${hy2}" r="3" fill="${GND_C}"/>`;
    s += T(hx1+8, (hy1+hy2)/2, 'GND 레일 브리지', {size:10.5, fill:C.mute});
  }

  // ============================ Sensor 1: DS18B20 (TO-92 + 4.7k pullup) ============================
  // Use columns 6-8 for sensor body, columns 10-12 for resistor
  // VCC=col6/row0, DATA=col7/row0, GND=col8/row0; Resistor: col7/row1 → col2 (3V3 rail strip)
  {
    const baseRow = 0;
    const [vx, vy] = holeXY(6, baseRow);
    const [dx, dy] = holeXY(7, baseRow);
    const [gx, gy] = holeXY(8, baseRow);
    // TO-92 body (rounded half-cylinder) sitting above breadboard
    const bx = vx-6, by = vy-58;
    s += `<path d="M ${bx-22} ${by+30} Q ${bx+12} ${by-12}, ${bx+46} ${by+30} L ${bx+46} ${by+45} L ${bx-22} ${by+45} Z" fill="#1a1a1a"/>`;
    s += T(bx+12, by+5, 'DS18B20', {size:9, anchor:'middle', fill:'#fff', weight:700});
    s += T(bx+12, by+18, '(수온)', {size:8, anchor:'middle', fill:'#aaa'});
    // legs going to breadboard
    s += `<line x1="${vx}" y1="${by+45}" x2="${vx}" y2="${vy-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<line x1="${dx}" y1="${by+45}" x2="${dx}" y2="${dy-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<line x1="${gx}" y1="${by+45}" x2="${gx}" y2="${gy-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    // Leg labels
    s += T(vx, by+55, 'V', {size:9, anchor:'middle', fill:V33, weight:700});
    s += T(dx, by+55, 'D', {size:9, anchor:'middle', fill:SIG, weight:700});
    s += T(gx, by+55, 'G', {size:9, anchor:'middle', fill:GND_C, weight:700});

    // 4.7k pull-up resistor between DATA (col 7) and 3V3 rail (col 2)
    // Resistor body in row 1: spans col 4 to col 10 on row 1
    const [r1x, r1y] = holeXY(4, 1);
    const [r2x, r2y] = holeXY(10, 1);
    // Wire from DATA hole (col7,row0) down to col7,row1
    s += `<line x1="${dx}" y1="${dy}" x2="${dx}" y2="${r1y}" stroke="${SIG}" stroke-width="3"/>`;
    // Use a colored resistor body
    const ry = (r1y+r2y)/2;
    // bent leads
    s += `<line x1="${r1x}" y1="${ry}" x2="${r1x+20}" y2="${ry}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<line x1="${r2x-20}" y1="${ry}" x2="${r2x}" y2="${ry}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    // body (beige with colored bands)
    s += `<rect x="${r1x+20}" y="${ry-9}" width="${r2x-r1x-40}" height="18" rx="9" fill="#e7d6a8" stroke="#8a6d1a"/>`;
    // 4.7k bands: yellow, violet, red, gold
    const bw = 5, bGap = 12;
    const bstart = r1x+28;
    ['#f4c542','#7c3aed','#d4453b','#d4a017'].forEach((cl,i)=>{
      s += `<rect x="${bstart+i*bGap}" y="${ry-9}" width="${bw}" height="18" fill="${cl}"/>`;
    });
    s += T((r1x+r2x)/2, ry-14, '4.7kΩ', {size:9.5, anchor:'middle', fill:C.warn, weight:700});
    // Holes feedback
    s += `<line x1="${r1x}" y1="${r1y-4}" x2="${r1x}" y2="${r1y+4}" stroke="${C.warn}" stroke-width="2"/>`;
    // wire from r1 (col4 row1) up to 3V3 rail column 2 — go via top rail same row
    s += `<line x1="${r1x}" y1="${r1y}" x2="${r1x}" y2="${tprPosY+4}" stroke="${V33}" stroke-width="3"/>`;

    // VCC (col6) → 3V3 rail (col 2) — go up
    s += `<line x1="${vx}" y1="${vy}" x2="${vx}" y2="${tprPosY+4}" stroke="${V33}" stroke-width="3"/>`;
    // GND (col8) → top − rail
    s += `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;

    // DATA jumper to ESP32 IO4 (long Bezier going up to the right side of ESP32)
    s += jumper(dx, r1y, P_IO4.x + 12, P_IO4.y, SIG, 4);

    // Label box under sensor
    s += `<rect x="${vx-30}" y="${gy+30}" width="100" height="36" rx="6" fill="#fff8e6" stroke="#e0b94a"/>`;
    s += T(vx+20, gy+44, '수온 DS18B20', {size:10, anchor:'middle', weight:700});
    s += T(vx+20, gy+58, '3.3V · DATA→IO4', {size:9.5, anchor:'middle', fill:C.mute});
  }

  // ============================ Sensor 2: GL5528 (LDR + 10k pulldown) ============================
  // Cols 16-19 area
  {
    const colVcc = 16, colSig = 18;
    const [vx, vy] = holeXY(colVcc, 0);
    const [dx, dy] = holeXY(colSig, 0);
    // LDR body
    const cx = (vx+dx)/2, cy = vy-50;
    s += `<circle cx="${cx}" cy="${cy}" r="18" fill="#cfa55c" stroke="#5b3a14"/>`;
    // squiggle (resistor pattern on top)
    s += `<path d="M ${cx-12} ${cy} q 4 -10 8 0 t 8 0 t 8 0" fill="none" stroke="#1a1a1a" stroke-width="1.4"/>`;
    s += T(cx, cy+30, 'GL5528', {size:9.5, anchor:'middle', weight:700});
    // legs
    s += `<line x1="${vx}" y1="${cy+8}" x2="${vx}" y2="${vy-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<line x1="${dx}" y1="${cy+8}" x2="${dx}" y2="${dy-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    // VCC → 3.3V rail
    s += `<line x1="${vx}" y1="${vy}" x2="${vx}" y2="${tprPosY+4}" stroke="${V33}" stroke-width="3"/>`;
    // 10k pulldown between IO33 node and GND rail (row 1 → top − rail)
    const [r1x, r1y] = holeXY(colSig, 1);
    const [r2x, r2y] = holeXY(colSig+3, 1);
    s += `<line x1="${dx}" y1="${dy}" x2="${dx}" y2="${r1y}" stroke="${SIG2}" stroke-width="3"/>`;
    const ry = r1y;
    s += `<line x1="${r1x}" y1="${ry}" x2="${r1x+16}" y2="${ry}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<line x1="${r2x-16}" y1="${ry}" x2="${r2x}" y2="${ry}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<rect x="${r1x+16}" y="${ry-9}" width="${r2x-r1x-32}" height="18" rx="9" fill="#e7d6a8" stroke="#8a6d1a"/>`;
    ['#7c3aed','#1a1a1a','#fb923c','#d4a017'].forEach((cl,i)=>{
      s += `<rect x="${r1x+24+i*10}" y="${ry-9}" width="5" height="18" fill="${cl}"/>`;
    });
    s += T((r1x+r2x)/2, ry-14, '10kΩ', {size:9.5, anchor:'middle', fill:C.mute, weight:700});
    // R2 (col 21, row 1) → bottom − rail via the gap? It's easier: r2 → top − rail
    s += `<line x1="${r2x}" y1="${ry}" x2="${r2x}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;

    // Jumper from SIG hole to IO33
    s += jumper(dx, r1y, P_IO33.x - 12, P_IO33.y, SIG2, 4);

    s += `<rect x="${vx-30}" y="${dy+40}" width="100" height="36" rx="6" fill="#fff8e6" stroke="#e0b94a"/>`;
    s += T(vx+20, dy+54, '조도 GL5528', {size:10, anchor:'middle', weight:700});
    s += T(vx+20, dy+68, '3.3V · → IO33', {size:9.5, anchor:'middle', fill:C.mute});
  }

  // ============================ Sensor 3: SEN0189 (탁도) — 5V, 분압 ============================
  {
    const colBase = 26;
    // Sensor module (rectangle with 3 pins)
    const modX = colStart + colBase * colSpace - 20, modY = stripStartY + 5*rowSpace + 100;  // below bottom strip area
    // Place module BELOW the breadboard for clarity (off-board), with leads coming up
    // Actually keep all sensors above breadboard for consistency. Use a small rectangle for module.
    const sx = colStart + colBase * colSpace;
    const mw = 90, mh = 60;
    const mxL = sx - mw/2, myT = stripStartY - mh - 16;
    s += `<rect x="${mxL}" y="${myT}" width="${mw}" height="${mh}" rx="4" fill="#1f6b43" stroke="#0a3a22"/>`;
    s += T(mxL+mw/2, myT+22, 'SEN0189', {size:10, anchor:'middle', fill:'#fff', weight:700});
    s += T(mxL+mw/2, myT+38, '탁도', {size:10, anchor:'middle', fill:'#a9e0c0'});
    // 3 pins → 3 holes on breadboard (col, col+1, col+2)
    for (let k=0;k<3;k++) {
      const [hx, hy] = holeXY(colBase-1+k, 0);
      const px = mxL + 12 + k*32;
      s += `<line x1="${px}" y1="${myT+mh}" x2="${hx}" y2="${hy-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    }
    // Labels: VCC, OUT, GND (left, mid, right)
    s += T(colStart+(colBase-1)*colSpace, myT+mh+10, 'V', {size:9, anchor:'middle', fill:V5, weight:700});
    s += T(colStart+(colBase  )*colSpace, myT+mh+10, 'O', {size:9, anchor:'middle', fill:SIG3, weight:700});
    s += T(colStart+(colBase+1)*colSpace, myT+mh+10, 'G', {size:9, anchor:'middle', fill:GND_C, weight:700});

    // VCC → 5V (bottom + rail)
    const [vx, vy] = holeXY(colBase-1, 0);
    s += jumper(vx, vy+4, vx, bprPosY-4, V5, 3.5);
    // GND → top − rail
    const [gx, gy] = holeXY(colBase+1, 0);
    s += `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;
    // OUT → 10k → node → IO32 (with 20k pulldown + 0.1uF)
    const [ox, oy] = holeXY(colBase, 0);
    // Move OUT down through 10k resistor to row 2 (node)
    const [n1x, n1y] = holeXY(colBase, 2);
    const ry1 = (oy+n1y)/2;
    // 10k resistor (vertical) between row 0 and row 2 of col=colBase
    s += `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${ry1-12}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<line x1="${ox}" y1="${ry1+12}" x2="${ox}" y2="${n1y-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<rect x="${ox-9}" y="${ry1-12}" width="18" height="24" rx="3" fill="#e7d6a8" stroke="#8a6d1a"/>`;
    s += T(ox+18, ry1+3, '10k', {size:9, fill:C.mute, weight:700});
    // 20k from node down to GND (row 2 → top − rail), placed at col+2
    const [n2x, n2y] = holeXY(colBase+2, 2);
    s += `<line x1="${n1x}" y1="${n1y}" x2="${n2x}" y2="${n1y}" stroke="${SIG3}" stroke-width="3"/>`;
    s += `<line x1="${n2x}" y1="${n1y}" x2="${n2x}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;
    // Show 20k as horizontal between (col, row3) and (col+2, row3) — simplify: just label
    s += T(n2x+12, n1y+2, '20kΩ↓', {size:9, fill:C.mute, weight:700});

    // 0.1uF from node to GND rail
    s += T(ox-14, n1y+14, '‖ 0.1µF', {size:9, fill:C.cap, weight:700, anchor:'end'});

    // Jumper from node to IO32 (long line up to ESP32)
    s += jumper(ox, n1y, P_IO32.x - 12, P_IO32.y, SIG3, 4);

    s += `<rect x="${ox-50}" y="${n1y+30}" width="110" height="36" rx="6" fill="#fff8e6" stroke="#e0b94a"/>`;
    s += T(ox+5, n1y+44, '탁도 SEN0189', {size:10, anchor:'middle', weight:700});
    s += T(ox+5, n1y+58, '5V · → IO32 (분압)', {size:9.5, anchor:'middle', fill:C.mute});
  }

  // ============================ Sensor 4: PH4502C — 5V, 분압 ============================
  {
    const colBase = 36;
    const sx = colStart + colBase * colSpace;
    const mw = 110, mh = 60;
    const mxL = sx - mw/2, myT = stripStartY - mh - 16;
    s += `<rect x="${mxL}" y="${myT}" width="${mw}" height="${mh}" rx="4" fill="#1e3a5f" stroke="#0d2440"/>`;
    s += T(mxL+mw/2, myT+22, 'PH4502C', {size:10, anchor:'middle', fill:'#fff', weight:700});
    s += T(mxL+mw/2, myT+38, 'pH', {size:10, anchor:'middle', fill:'#a8c5e0'});
    for (let k=0;k<3;k++) {
      const [hx, hy] = holeXY(colBase-1+k, 0);
      const px = mxL + 18 + k*36;
      s += `<line x1="${px}" y1="${myT+mh}" x2="${hx}" y2="${hy-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    }
    s += T(colStart+(colBase-1)*colSpace, myT+mh+10, 'V+', {size:9, anchor:'middle', fill:V5, weight:700});
    s += T(colStart+(colBase  )*colSpace, myT+mh+10, 'PO', {size:9, anchor:'middle', fill:SIG4, weight:700});
    s += T(colStart+(colBase+1)*colSpace, myT+mh+10, 'G', {size:9, anchor:'middle', fill:GND_C, weight:700});

    const [vx, vy] = holeXY(colBase-1, 0);
    s += jumper(vx, vy+4, vx, bprPosY-4, V5, 3.5);
    const [gx, gy] = holeXY(colBase+1, 0);
    s += `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;
    const [ox, oy] = holeXY(colBase, 0);
    const [n1x, n1y] = holeXY(colBase, 2);
    const ry1 = (oy+n1y)/2;
    s += `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${ry1-12}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<line x1="${ox}" y1="${ry1+12}" x2="${ox}" y2="${n1y-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<rect x="${ox-9}" y="${ry1-12}" width="18" height="24" rx="3" fill="#e7d6a8" stroke="#8a6d1a"/>`;
    s += T(ox+18, ry1+3, '10k', {size:9, fill:C.mute, weight:700});
    const [n2x, n2y] = holeXY(colBase+2, 2);
    s += `<line x1="${n1x}" y1="${n1y}" x2="${n2x}" y2="${n1y}" stroke="${SIG4}" stroke-width="3"/>`;
    s += `<line x1="${n2x}" y1="${n1y}" x2="${n2x}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;
    s += T(n2x+12, n1y+2, '20kΩ↓', {size:9, fill:C.mute, weight:700});
    s += T(ox-14, n1y+14, '‖ 1µF', {size:9, fill:C.cap, weight:700, anchor:'end'});
    s += jumper(ox, n1y, P_IO34.x - 12, P_IO34.y, SIG4, 4);
    s += `<rect x="${ox-50}" y="${n1y+30}" width="110" height="36" rx="6" fill="#fff8e6" stroke="#e0b94a"/>`;
    s += T(ox+5, n1y+44, 'pH PH4502C', {size:10, anchor:'middle', weight:700});
    s += T(ox+5, n1y+58, '5V · → IO34 (분압)', {size:9.5, anchor:'middle', fill:C.mute});
  }

  // ============================ Sensor 5: XKC-Y25-V (수위) — 5V, 분압 ============================
  {
    const colBase = 46;
    const sx = colStart + colBase * colSpace;
    // Body = cylindrical sensor (drawn as small cylinder + 3 wires going to breadboard)
    const cx2 = sx, cy2 = stripStartY - 70;
    s += `<ellipse cx="${cx2}" cy="${cy2-30}" rx="22" ry="6" fill="#8a8a8a"/>`;
    s += `<rect x="${cx2-22}" y="${cy2-30}" width="44" height="40" fill="#a3a3a3" stroke="#666"/>`;
    s += `<ellipse cx="${cx2}" cy="${cy2+10}" rx="22" ry="6" fill="#cbd5e1"/>`;
    s += T(cx2, cy2-8, 'XKC', {size:10, anchor:'middle', fill:'#000', weight:700});
    s += T(cx2, cy2+4, 'Y25-V', {size:9, anchor:'middle', fill:'#000'});
    // 3 wires emerge from bottom: brown(V+), black(OUT), blue(GND)
    const wireColors = ['#9e6b3a', '#1a1a1a', '#1e3a8a'];
    const labels = ['V+', 'O', 'G'];
    const labelColors = [V5, SIG5, GND_C];
    for (let k=0;k<3;k++) {
      const [hx, hy] = holeXY(colBase-1+k, 0);
      const px = cx2 - 12 + k*12;
      s += `<path d="M ${px} ${cy2+10} Q ${(px+hx)/2} ${(cy2+hy)/2}, ${hx} ${hy-4}" fill="none" stroke="${wireColors[k]}" stroke-width="2.5"/>`;
      s += T(colStart+(colBase-1+k)*colSpace, cy2+30, labels[k], {size:9, anchor:'middle', fill:labelColors[k], weight:700});
    }

    const [vx, vy] = holeXY(colBase-1, 0);
    s += jumper(vx, vy+4, vx, bprPosY-4, V5, 3.5);
    const [gx, gy] = holeXY(colBase+1, 0);
    s += `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;
    const [ox, oy] = holeXY(colBase, 0);
    const [n1x, n1y] = holeXY(colBase, 2);
    const ry1 = (oy+n1y)/2;
    s += `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${ry1-12}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<line x1="${ox}" y1="${ry1+12}" x2="${ox}" y2="${n1y-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    s += `<rect x="${ox-9}" y="${ry1-12}" width="18" height="24" rx="3" fill="#e7d6a8" stroke="#8a6d1a"/>`;
    s += T(ox+18, ry1+3, '10k', {size:9, fill:C.mute, weight:700});
    const [n2x, n2y] = holeXY(colBase+2, 2);
    s += `<line x1="${n1x}" y1="${n1y}" x2="${n2x}" y2="${n1y}" stroke="${SIG5}" stroke-width="3"/>`;
    s += `<line x1="${n2x}" y1="${n1y}" x2="${n2x}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;
    s += T(n2x+12, n1y+2, '20kΩ↓', {size:9, fill:C.mute, weight:700});
    s += jumper(ox, n1y, P_IO35.x - 12, P_IO35.y, SIG5, 4);
    s += `<rect x="${ox-50}" y="${n1y+30}" width="110" height="36" rx="6" fill="#fff8e6" stroke="#e0b94a"/>`;
    s += T(ox+5, n1y+44, '수위 XKC-Y25-V', {size:10, anchor:'middle', weight:700});
    s += T(ox+5, n1y+58, '5V · → IO35 (분압)', {size:9.5, anchor:'middle', fill:C.mute});
  }

  // ============================ 범례 ============================
  const lgX = 80, lgY = bbY + bbH + 30;
  s += `<rect x="${lgX}" y="${lgY}" width="${bbW}" height="80" rx="10" fill="#f9fafb" stroke="${C.boxStroke}"/>`;
  s += T(lgX+18, lgY+24, '점퍼선 색 의미', {size:13, weight:700, fill:C.accent});
  const legends = [
    ['3.3V (수온·조도)', V33],
    ['5V (탁도·pH·수위)', V5],
    ['GND (공통)', GND_C],
    ['수온 DATA → IO4', SIG],
    ['조도 → IO33', SIG2],
    ['탁도 → IO32', SIG3],
    ['pH → IO34', SIG4],
    ['수위 → IO35', SIG5],
  ];
  legends.forEach((lg, i) => {
    const col = i % 4, row = Math.floor(i/4);
    const x = lgX + 20 + col*340, y = lgY + 50 + row*22;
    s += `<line x1="${x}" y1="${y}" x2="${x+34}" y2="${y}" stroke="${lg[1]}" stroke-width="5"/>`;
    s += T(x+42, y+4, lg[0], {size:11.5});
  });

  // Note about LCD
  s += T(lgX, lgY+110, '* LCD는 핀이 많아 따로 그림 → docs/LCD_wiring.svg 참고. 본 그림은 센서 5개 결선만.', {size:11.5, fill:C.mute});
  // Footer
  s += T(W/2, H-26, '핵심: 3.3V 레일(빨강 + ) · GND 레일(파랑 − ) · 5V 레일(아래쪽 + ) — 센서마다 분압·필터로 ADC 안정', {size:13, anchor:'middle', weight:700, fill:'#0f4c81'});

  return svgDoc(W, H, s);
}

// ===== B보드 Fritzing 스타일 (실물 릴레이 + 펌프/히터) =====
function buildBFritzing() {
  const W=2240, H=1320;
  const C5='#d4453b', CG='#374151', CS='#2563eb', C12='#1f6b43', C220='#b0291f', CCAP='#7c3aed';
  let s='';
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += T(40,42,'B보드 결선도 (Fritzing 스타일) — ESP32 + 3채널 릴레이 + 펌프2 + 히터', {size:24, weight:700});
  s += T(40,72,'제어선(빨강5V·회색GND·파랑IOxx)은 ESP32→릴레이 일직선. 출력은 나사단자 COM/NO에 결선.', {size:13.5, fill:C.mute});

  // ===== ESP32 (왼쪽) — 사용 핀 5개를 오른쪽 가장자리에 정렬 =====
  const eX=70, eY=250, eW=290, eH=600;
  s += `<rect x="${eX}" y="${eY}" width="${eW}" height="${eH}" rx="10" fill="#1e3a5f" stroke="#0d2440" stroke-width="2"/>`;
  s += T(eX+eW/2, eY+24, 'ESP32 WROOM-32', {size:14, anchor:'middle', fill:'#a8c5e0', weight:700});
  // USB
  s += `<rect x="${eX+eW/2-30}" y="${eY-20}" width="60" height="22" rx="3" fill="#555"/>`+T(eX+eW/2, eY-4,'USB',{size:9,anchor:'middle',fill:'#fff'});
  // can
  s += `<rect x="${eX+30}" y="${eY+60}" width="95" height="150" fill="#c0c8d0" stroke="#7a7a7a"/>`+T(eX+77, eY+140,'ESP32',{size:11,anchor:'middle',fill:'#000',weight:700});
  // 사용 핀 (오른쪽 가장자리)
  const usedPins = [['5V',C5,410],['GND',CG,490],['IO25',CS,570],['IO26',CS,650],['IO27',CS,730]];
  const epX = eX+eW;
  usedPins.forEach(p=>{
    s += `<rect x="${epX-9}" y="${p[2]-9}" width="18" height="18" fill="#222"/>`;
    s += `<circle cx="${epX}" cy="${p[2]}" r="5" fill="#d4a017" stroke="#7a5d05"/>`;
    s += T(epX-16, p[2]+4, p[0], {size:12, anchor:'end', fill:'#fff', weight:700});
  });
  s += T(eX+eW/2, eY+eH-16, '※ 핀은 보드 인쇄(라벨) 기준으로 찾으세요', {size:9.5, anchor:'middle', fill:'#9fb6cc'});

  // ===== 3채널 릴레이 모듈 (가운데) =====
  const rX=650, rY=330, rW=480, rH=470;
  s += `<rect x="${rX}" y="${rY}" width="${rW}" height="${rH}" rx="8" fill="#1457a8" stroke="#0a3a78" stroke-width="2"/>`;
  s += T(rX+rW/2, rY+26, '3채널 릴레이 모듈', {size:15, anchor:'middle', fill:'#fff', weight:700});
  s += T(rX+rW/2, rY+44, 'LOW = ON', {size:11.5, anchor:'middle', fill:'#ffd9d2', weight:700});
  // 입력 핀 (왼쪽) — ESP32와 같은 높이로 정렬
  const inPins = [['VCC',C5,410],['GND',CG,490],['IN1',CS,570],['IN2',CS,650],['IN3',CS,730]];
  inPins.forEach(p=>{
    s += `<circle cx="${rX}" cy="${p[2]}" r="5" fill="#d4a017" stroke="#7a5d05"/>`;
    s += T(rX+12, p[2]+4, p[0], {size:12, fill:'#fff', weight:700});
  });
  // 릴레이 큐브 3개 + LED
  const cubeCenters = [430, 560, 690];
  cubeCenters.forEach((cy,i)=>{
    s += `<rect x="${rX+150}" y="${cy-40}" width="130" height="80" rx="3" fill="#1e63c0" stroke="#0a2f6b"/>`;
    s += T(rX+215, cy-6, 'RELAY', {size:10, anchor:'middle', fill:'#cfe0f7', weight:700});
    s += T(rX+215, cy+12, 'CH'+(i+1), {size:12, anchor:'middle', fill:'#fff', weight:700});
    s += `<circle cx="${rX+150}" cy="${cy-50}" r="5" fill="#ff5a4d"/>`; // LED
  });
  // 나사 단자 블록 3개 (오른쪽)
  const blockX = rX+rW-78;
  const blocks = cubeCenters.map((cy,i)=>{
    const by = cy-36;
    s += `<rect x="${blockX}" y="${by}" width="86" height="72" rx="3" fill="#2e7d32" stroke="#1b4d1e"/>`;
    // 3 나사: NC(위) COM(중) NO(아래)
    const terms = [['NC', by+14, '#9ca3af'],['COM', by+36, '#fbbf24'],['NO', by+58, '#fbbf24']];
    terms.forEach(t=>{
      s += `<circle cx="${blockX+20}" cy="${t[1]}" r="7" fill="#d4d4d4" stroke="#666"/>`;
      s += `<line x1="${blockX+16}" y1="${t[1]}" x2="${blockX+24}" y2="${t[1]}" stroke="#333" stroke-width="1.5"/>`;
      s += T(blockX+34, t[1]+4, t[0], {size:10, fill:t[2]==='#9ca3af'?'#cbd5c0':'#fff', weight:700});
    });
    return { x:blockX+20, com: by+36, no: by+58, nc: by+14, cy };
  });

  // ===== 제어선: ESP32 → 릴레이 (수평 직선, 교차 0) =====
  const ctrl = [[410,C5],[490,CG],[570,CS],[650,CS],[730,CS]];
  ctrl.forEach(c=> s += `<line x1="${epX+5}" y1="${c[0]}" x2="${rX-5}" y2="${c[0]}" stroke="${c[1]}" stroke-width="4.5" stroke-linecap="round"/>`);
  // 디커플링 커패시터 (VCC-GND 사이, 릴레이 근처)
  const dcx=rX-70;
  s += `<line x1="${dcx}" y1="410" x2="${dcx}" y2="445" stroke="${CCAP}" stroke-width="2.4"/>`;
  s += `<line x1="${dcx-12}" y1="445" x2="${dcx+12}" y2="445" stroke="${CCAP}" stroke-width="3"/>`;
  s += `<line x1="${dcx-12}" y1="452" x2="${dcx+12}" y2="452" stroke="${CCAP}" stroke-width="3"/>`;
  s += `<line x1="${dcx}" y1="452" x2="${dcx}" y2="490" stroke="${CCAP}" stroke-width="2.4"/>`;
  s += T(dcx, 400, '10µF+0.1µF', {size:10, anchor:'middle', fill:CCAP, weight:700});
  s += T(dcx, 388, '디커플링', {size:10, anchor:'middle', fill:CCAP, weight:700});

  // ===== 부하 (오른쪽) =====
  // 펌프1, 펌프2 (12V), 히터(220V)
  function pump(x,y,label){
    let g = `<circle cx="${x}" cy="${y}" r="44" fill="#e5e7eb" stroke="${CG}" stroke-width="2"/>`;
    g += `<circle cx="${x}" cy="${y}" r="30" fill="#fff" stroke="#9ca3af"/>`;
    g += T(x, y-4, label, {size:12, anchor:'middle', weight:700});
    g += T(x, y+14, '12V', {size:10, anchor:'middle', fill:C.mute});
    // + (위), - (아래) 단자
    g += `<circle cx="${x}" cy="${y-44}" r="4" fill="${C12}"/>`+T(x-12, y-44, '+', {size:13, anchor:'end', fill:C12, weight:700});
    g += `<circle cx="${x}" cy="${y+44}" r="4" fill="${CG}"/>`+T(x-12, y+50, '−', {size:13, anchor:'end', fill:CG, weight:700});
    return g;
  }
  const p1x=1360, p1y=430, p2x=1360, p2y=590;
  s += pump(p1x,p1y,'펌프1');
  s += pump(p2x,p2y,'펌프2');
  // 히터
  const hX=1300, hY=700, hW=140, hH=84;
  s += `<rect x="${hX}" y="${hY}" width="${hW}" height="${hH}" rx="8" fill="#fff5f4" stroke="${C220}" stroke-width="2"/>`;
  s += T(hX+hW/2, hY+30, '히터', {size:14, anchor:'middle', weight:700, fill:C220});
  s += T(hX+hW/2, hY+50, 'HE-50W', {size:10.5, anchor:'middle', fill:C.mute});
  s += T(hX+hW/2, hY+68, '220V AC', {size:10.5, anchor:'middle', fill:C220, weight:700});
  s += `<circle cx="${hX}" cy="${hY+20}" r="4" fill="${C220}"/>`+T(hX-8, hY+24, 'L', {size:12, anchor:'end', fill:C220, weight:700});
  s += `<circle cx="${hX}" cy="${hY+60}" r="4" fill="${CG}"/>`+T(hX-8, hY+64, 'N', {size:12, anchor:'end', fill:CG, weight:700});

  // ===== 전원 (far right) =====
  // 12V 어댑터
  const aX=1820, aY=420, aW=170, aH=110;
  s += `<rect x="${aX}" y="${aY}" width="${aW}" height="${aH}" rx="8" fill="#f6f8fa" stroke="${CG}" stroke-width="1.6"/>`;
  s += T(aX+aW/2, aY+30, '12V 어댑터', {size:13, anchor:'middle', weight:700});
  s += T(aX+aW/2, aY+50, '펌프1·2 공용', {size:10.5, anchor:'middle', fill:C.mute});
  s += `<circle cx="${aX}" cy="${aY+78}" r="5" fill="${C12}"/>`+T(aX+12, aY+82, '12V +', {size:11, fill:C12, weight:700});
  s += `<circle cx="${aX}" cy="${aY+98}" r="5" fill="${CG}"/>`+T(aX+12, aY+102, '12V −', {size:11, fill:CG, weight:700});
  // 220V 콘센트
  const oX=1820, oY=700, oW=180, oH=110;
  s += `<rect x="${oX}" y="${oY}" width="${oW}" height="${oH}" rx="8" fill="#fff5f4" stroke="${C220}" stroke-width="1.6"/>`;
  s += T(oX+oW/2, oY+28, '⚠ 220V 콘센트', {size:13, anchor:'middle', weight:700, fill:C220});
  s += T(oX+oW/2, oY+46, '(돼지코)', {size:10.5, anchor:'middle', fill:C.mute});
  s += `<circle cx="${oX}" cy="${oY+74}" r="5" fill="${C220}"/>`+T(oX+12, oY+78, 'L (활선)', {size:11, fill:C220, weight:700});
  s += `<circle cx="${oX}" cy="${oY+96}" r="5" fill="${CG}"/>`+T(oX+12, oY+100, 'N (중성)', {size:11, fill:CG, weight:700});

  // ===== 출력 배선 =====
  // CH1 → 펌프1 (12V)
  const b1=blocks[0], b2=blocks[1], b3=blocks[2];
  // NO1 → 펌프1(+)  (위로 우회 안하고 직접)
  s += `<polyline points="${blockX+86},${b1.no} ${p1x-70},${b1.no} ${p1x-70},${p1y-44} ${p1x},${p1y-44}" fill="none" stroke="${C12}" stroke-width="3.5" stroke-linejoin="round"/>`;
  // 펌프1(−) → 12V−   (아래로)
  s += `<polyline points="${p1x},${p1y+44} ${p1x},${p1y+88} ${aX-40},${p1y+88} ${aX-40},${aY+98} ${aX},${aY+98}" fill="none" stroke="${CG}" stroke-width="3.5" stroke-linejoin="round"/>`;
  // COM1 → 12V+   (위 채널로 우회)
  s += `<polyline points="${blockX+86-66},${b1.com} ${blockX+30},${b1.com} ${blockX+30},${b1.com-60} ${aX-70},${b1.com-60} ${aX-70},${aY+78} ${aX},${aY+78}" fill="none" stroke="${C12}" stroke-width="3" stroke-linejoin="round" stroke-dasharray="1 0"/>`;
  s += T(blockX-6, b1.com+4, 'COM', {size:9.5, anchor:'end', fill:C12, weight:700});

  // CH2 → 펌프2
  s += `<polyline points="${blockX+86},${b2.no} ${p2x-70},${b2.no} ${p2x-70},${p2y-44} ${p2x},${p2y-44}" fill="none" stroke="${C12}" stroke-width="3.5" stroke-linejoin="round"/>`;
  s += `<polyline points="${p2x},${p2y+44} ${p2x},${p2y+78} ${aX-58},${p2y+78} ${aX-58},${aY+98} ${aX},${aY+98}" fill="none" stroke="${CG}" stroke-width="3.5" stroke-linejoin="round"/>`;
  s += `<polyline points="${blockX+20},${b2.com} ${blockX+20},${b2.com+40} ${aX-86},${b2.com+40} ${aX-86},${aY+78} ${aX},${aY+78}" fill="none" stroke="${C12}" stroke-width="3" stroke-linejoin="round"/>`;

  // CH3 → 히터 (220V)
  // NO3 → 히터 L
  s += `<polyline points="${blockX+86},${b3.no} ${hX-40},${b3.no} ${hX-40},${hY+20} ${hX},${hY+20}" fill="none" stroke="${C220}" stroke-width="3.5" stroke-linejoin="round"/>`;
  // COM3 → 220V L
  s += `<polyline points="${blockX+20},${b3.com} ${blockX+20},${b3.com+96} ${oX-46},${b3.com+96} ${oX-46},${oY+74} ${oX},${oY+74}" fill="none" stroke="${C220}" stroke-width="3" stroke-linejoin="round"/>`;
  // 히터 N → 220V N
  s += `<polyline points="${hX},${hY+60} ${hX-24},${hY+60} ${hX-24},${oY+130} ${oX-24},${oY+130} ${oX-24},${oY+96} ${oX},${oY+96}" fill="none" stroke="${CG}" stroke-width="3.5" stroke-linejoin="round"/>`;

  // 단자 라벨 (NO 강조)
  s += T(blockX+90, b1.no-6, 'NO→펌프1(+)', {size:9.5, fill:C12, weight:700});
  s += T(blockX+90, b2.no-6, 'NO→펌프2(+)', {size:9.5, fill:C12, weight:700});
  s += T(blockX+90, b3.no-6, 'NO→히터 L', {size:9.5, fill:C220, weight:700});

  // ===== 범례 =====
  const lgX=60, lgY=H-150;
  s += `<rect x="${lgX}" y="${lgY}" width="${W-120}" height="84" rx="10" fill="#f9fafb" stroke="${C.boxStroke}"/>`;
  s += T(lgX+18, lgY+24, '배선 색', {size:13, weight:700, fill:C.accent});
  const legs=[['5V (릴레이 VCC)',C5],['GND',CG],['신호 IO25/26/27',CS],['12V 부하',C12],['220V 부하',C220]];
  legs.forEach((l,i)=>{ const x=lgX+20+i*420, y=lgY+52; s+=`<line x1="${x}" y1="${y}" x2="${x+34}" y2="${y}" stroke="${l[1]}" stroke-width="5"/>`+T(x+42,y+4,l[0],{size:11.5}); });

  s += `<rect x="${lgX}" y="${H-58}" width="${W-120}" height="40" rx="8" fill="#fff8e6" stroke="#e0b94a"/>`;
  s += T(lgX+16, H-33, '핵심: ESP32 5핀(5V·GND·IO25·IO26·IO27) → 릴레이 입력 / 릴레이 COM ← 전원(+), NO → 부하 / 220V는 활선만 끊음 · 코드 뽑고 작업', {size:12, fill:'#8a6d1a', weight:600});

  return svgDoc(W, H, s);
}

// ===== A보드 Fritzing v2: 교차 없는 Manhattan 라우팅, 핀순 정렬 =====
function buildAFritzing() {
  const W=2000, H=1520;
  const V5='#d4453b', V33='#e8893c', GND_C='#1f2937';
  // 센서별 색
  const SG = { pH:'#ec4899', water:'#a855f7', turb:'#3b82f6', light:'#10b981', temp:'#fbbf24' };
  let s = '';
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += T(40,42,'A보드 결선도 (Fritzing 스타일 v2) — 점퍼선 교차 없음', {size:24, weight:700});
  s += T(40,72,'센서를 ESP32 핀 위치 순으로 배치 + 신호선마다 전용 채널 + 직각(Manhattan) 라우팅', {size:13.5, fill:C.mute});

  // ============ ESP32 38pin DevKit (중앙 상단) ============
  const eX = 800, eY = 110, eW = 400, eH = 600;
  s += `<rect x="${eX}" y="${eY}" width="${eW}" height="${eH}" rx="10" fill="#1e3a5f" stroke="#0d2440" stroke-width="2"/>`;
  s += T(eX+eW/2, eY+22, 'ESP32-WROOM-32 DevKit (38pin)', {size:13, anchor:'middle', fill:'#a8c5e0', weight:700});
  // USB-C
  s += `<rect x="${eX+eW/2-32}" y="${eY-22}" width="64" height="24" rx="3" fill="#555"/>`;
  s += `<rect x="${eX+eW/2-28}" y="${eY-18}" width="56" height="16" rx="2" fill="#333"/>`;
  s += T(eX+eW/2, eY-3, 'USB-C', {size:9, anchor:'middle', fill:'#fff'});
  // Antenna
  const aX = eX+eW/2-55;
  s += `<rect x="${aX-5}" y="${eY+55}" width="120" height="32" fill="#1e3a5f"/>`;
  s += `<path d="M ${aX} ${eY+62} L ${aX+110} ${eY+62} L ${aX+110} ${eY+70} L ${aX+8} ${eY+70} L ${aX+8} ${eY+78} L ${aX+110} ${eY+78}" stroke="#c0c8d0" stroke-width="1.4" fill="none"/>`;
  // ESP32 can
  const mX = eX+eW/2-55, mY = eY+95;
  s += `<rect x="${mX}" y="${mY}" width="110" height="170" fill="#c0c8d0" stroke="#7a7a7a" stroke-width="1.5"/>`;
  s += T(mX+55, mY+90, 'ESP32', {size:13, anchor:'middle', fill:'#000', weight:700});
  s += T(mX+55, mY+108, 'WROOM-32', {size:10, anchor:'middle', fill:'#000'});
  // Buttons
  s += `<rect x="${eX+22}" y="${eY+eH-50}" width="22" height="22" rx="3" fill="#1a1a1a"/>`+T(eX+33, eY+eH-32, 'BOOT', {size:8, anchor:'middle', fill:'#a8c5e0'});
  s += `<rect x="${eX+eW-44}" y="${eY+eH-50}" width="22" height="22" rx="3" fill="#1a1a1a"/>`+T(eX+eW-33, eY+eH-32, 'EN', {size:8, anchor:'middle', fill:'#a8c5e0'});

  // 핀 헤더
  const leftPins  = ['3V3','EN','IO36','IO39','IO34','IO35','IO32','IO33','IO25','IO26','IO27','IO14','IO12','GND','IO13','SD2','SD3','CMD','5V'];
  const rightPins = ['GND','IO23','IO22','TX0','RX0','IO21','GND','IO19','IO18','IO5','IO17','IO16','IO4','IO0','IO2','IO15','SD1','SD0','CLK'];
  const pinSpace=26, pinTop=eY+135;
  const lpX=eX+18, rpX=eX+eW-18;
  for (let i=0;i<19;i++) {
    const y = pinTop+i*pinSpace;
    s += `<rect x="${lpX-9}" y="${y-9}" width="18" height="18" fill="#222"/>`+`<circle cx="${lpX}" cy="${y}" r="4" fill="#d4a017" stroke="#7a5d05"/>`+T(lpX+16,y+4,leftPins[i],{size:10.5,anchor:'start',fill:'#fff',weight:600});
    s += `<rect x="${rpX-9}" y="${y-9}" width="18" height="18" fill="#222"/>`+`<circle cx="${rpX}" cy="${y}" r="4" fill="#d4a017" stroke="#7a5d05"/>`+T(rpX-16,y+4,rightPins[i],{size:10.5,anchor:'end',fill:'#fff',weight:600});
  }
  const PL = (n)=>({x:lpX, y:pinTop+leftPins.indexOf(n)*pinSpace});
  const PR = (n)=>({x:rpX, y:pinTop+rightPins.indexOf(n)*pinSpace});

  // ============ Breadboard (아래쪽) ============
  const bbX=60, bbY=900, bbW=1880, bbH=460;
  s += `<rect x="${bbX}" y="${bbY}" width="${bbW}" height="${bbH}" rx="14" fill="#f5efe2" stroke="#b8a877" stroke-width="2"/>`;
  // 윗 레일 (+,-)
  const tprPosY=bbY+28, tprNegY=bbY+56;
  s += `<line x1="${bbX+22}" y1="${tprPosY}" x2="${bbX+bbW-22}" y2="${tprPosY}" stroke="${V33}" stroke-width="3.5"/>`;
  s += `<line x1="${bbX+22}" y1="${tprNegY}" x2="${bbX+bbW-22}" y2="${tprNegY}" stroke="${GND_C}" stroke-width="3.5"/>`;
  s += T(bbX+10, tprPosY+5, '+', {size:18, fill:V33, weight:700})+T(bbX+10, tprNegY+5, '−', {size:18, fill:GND_C, weight:700});
  s += T(bbX+bbW-6, tprPosY+5, '3.3V', {size:10, fill:V33, weight:700, anchor:'end'});
  s += T(bbX+bbW-6, tprNegY+5, 'GND', {size:10, fill:GND_C, weight:700, anchor:'end'});
  // 컬럼 격자 (74 cols)
  const colCount=74, colSpace=24, colStart=bbX+30;
  for (let i=0;i<colCount;i++) {
    const x = colStart+i*colSpace;
    s += `<circle cx="${x}" cy="${tprPosY}" r="2.4" fill="#1a1a1a"/>`+`<circle cx="${x}" cy="${tprNegY}" r="2.4" fill="#1a1a1a"/>`;
  }
  // 메인 영역
  const stripStartY=bbY+100, rowSpace=20;
  const gapY = stripStartY+5*rowSpace+6;
  for (let r=0;r<5;r++) for (let c=0;c<colCount;c++) s += `<circle cx="${colStart+c*colSpace}" cy="${stripStartY+r*rowSpace}" r="2.2" fill="#a3a3a3"/>`;
  s += `<rect x="${bbX+22}" y="${gapY}" width="${bbW-44}" height="14" fill="#e6d9b6"/>`;
  for (let r=0;r<5;r++) for (let c=0;c<colCount;c++) s += `<circle cx="${colStart+c*colSpace}" cy="${gapY+20+r*rowSpace}" r="2.2" fill="#a3a3a3"/>`;
  // 아랫 레일 (5V, GND)
  const bprNegY=bbY+bbH-56, bprPosY=bbY+bbH-28;
  s += `<line x1="${bbX+22}" y1="${bprNegY}" x2="${bbX+bbW-22}" y2="${bprNegY}" stroke="${GND_C}" stroke-width="3.5"/>`;
  s += `<line x1="${bbX+22}" y1="${bprPosY}" x2="${bbX+bbW-22}" y2="${bprPosY}" stroke="${V5}" stroke-width="3.5"/>`;
  for (let i=0;i<colCount;i++) { const x=colStart+i*colSpace; s += `<circle cx="${x}" cy="${bprNegY}" r="2.4" fill="#1a1a1a"/>`+`<circle cx="${x}" cy="${bprPosY}" r="2.4" fill="#1a1a1a"/>`; }
  s += T(bbX+10, bprNegY+5, '−', {size:18, fill:GND_C, weight:700})+T(bbX+10, bprPosY+5, '+', {size:18, fill:V5, weight:700});
  s += T(bbX+bbW-6, bprNegY+5, 'GND', {size:10, fill:GND_C, weight:700, anchor:'end'});
  s += T(bbX+bbW-6, bprPosY+5, '5V', {size:10, fill:V5, weight:700, anchor:'end'});

  const holeXY = (col, row) => { const x = colStart+col*colSpace; let y; if (row<5) y=stripStartY+row*rowSpace; else y=gapY+20+(row-5)*rowSpace; return [x,y]; };

  // Manhattan 라우팅: ESP32 핀 → 채널(수평) → 센서 열
  // 채널 y 값(겹치지 않게)
  // 신호 채널: 740~820 사이 5단 (위→아래 순서: 첫 센서 → 마지막 센서)
  const CH = [740, 758, 776, 794, 812];

  // 헬퍼: 직각 라우팅 (ESP32 핀 → 채널 → 센서 컬럼)
  function manhattan(pinX, pinY, sensorX, chY, color, w=4) {
    // pin → bend point → sensor column → drop down
    return `<polyline points="${pinX},${pinY} ${pinX},${chY} ${sensorX},${chY} ${sensorX},${chY+30}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`;
  }

  // 센서 정의 — ESP32 핀 위치 순으로 정렬해 교차 방지
  // ESP32 LEFT 핀 (위→아래): IO34(row4) IO35(row5) IO32(row6) IO33(row7) — pH, water, turbidity, light
  // ESP32 RIGHT 핀: IO4(row12) — temperature (맨 오른쪽)
  const sensors = [
    { name:'pH PH4502C',    col:5,  pin:PL('IO34'), io:'IO34', ch:CH[0], rail:'5V',  color:SG.pH,    type:'pcb', cap:'1µF'   },
    { name:'수위 XKC-Y25-V', col:18, pin:PL('IO35'), io:'IO35', ch:CH[1], rail:'5V',  color:SG.water, type:'cyl'              },
    { name:'탁도 SEN0189',   col:31, pin:PL('IO32'), io:'IO32', ch:CH[2], rail:'5V',  color:SG.turb,  type:'pcb', cap:'0.1µF' },
    { name:'조도 GL5528',    col:46, pin:PL('IO33'), io:'IO33', ch:CH[3], rail:'3V3', color:SG.light, type:'ldr', cap:'0.1µF' },
    { name:'수온 DS18B20',   col:62, pin:PR('IO4'),  io:'IO4',  ch:CH[4], rail:'3V3', color:SG.temp,  type:'to92'             },
  ];

  // ============ 전원선 (레일로) ============
  const P_3V3 = PL('3V3'), P_5V = PL('5V'), P_GND = PL('GND');
  // 3V3 → top + rail (col 1)
  {
    const hx = colStart+1*colSpace;
    s += `<polyline points="${P_3V3.x-12},${P_3V3.y} ${P_3V3.x-30},${P_3V3.y} ${P_3V3.x-30},${720} ${hx},${720} ${hx},${tprPosY-4}" fill="none" stroke="${V33}" stroke-width="4.5" stroke-linejoin="round"/>`;
    s += `<circle cx="${hx}" cy="${tprPosY}" r="3.5" fill="${V33}"/>`;
  }
  // 5V → bottom + rail (col 73)
  {
    const hx = colStart+73*colSpace;
    s += `<polyline points="${P_5V.x-12},${P_5V.y} ${P_5V.x-46},${P_5V.y} ${P_5V.x-46},${870} ${hx},${870} ${hx},${bprPosY-4}" fill="none" stroke="${V5}" stroke-width="4.5" stroke-linejoin="round"/>`;
    s += `<circle cx="${hx}" cy="${bprPosY}" r="3.5" fill="${V5}"/>`;
  }
  // GND → top − rail (col 2)
  {
    const hx = colStart+2*colSpace;
    s += `<polyline points="${P_GND.x-12},${P_GND.y} ${P_GND.x-38},${P_GND.y} ${P_GND.x-38},${728} ${hx},${728} ${hx},${tprNegY-4}" fill="none" stroke="${GND_C}" stroke-width="4.5" stroke-linejoin="round"/>`;
    s += `<circle cx="${hx}" cy="${tprNegY}" r="3.5" fill="${GND_C}"/>`;
  }
  // GND 양 레일 브리지 (오른쪽 끝)
  {
    const hx = colStart+72*colSpace;
    s += `<line x1="${hx}" y1="${tprNegY}" x2="${hx}" y2="${bprNegY}" stroke="${GND_C}" stroke-width="3"/>`;
    s += `<circle cx="${hx}" cy="${tprNegY}" r="3" fill="${GND_C}"/>`;
    s += `<circle cx="${hx}" cy="${bprNegY}" r="3" fill="${GND_C}"/>`;
  }

  // ============ 센서 그리기 ============
  for (const sn of sensors) {
    drawSensor(sn);
  }

  function drawSensor(sn) {
    const [hxCenter, hyTop] = holeXY(sn.col, 0);
    const railColor = sn.rail==='5V' ? V5 : V33;
    const railY    = sn.rail==='5V' ? bprPosY : tprPosY;

    // 모듈 박스 위치 (브레드보드 위 공간 사용)
    // 채널들이 y=740~820 사이라 모듈은 그 아래(브레드보드 바로 위)에 위치 (~830~880)
    const modY = 840;
    let modX, modW, modH = 50;
    let vccCol, sigCol, gndCol;

    if (sn.type === 'pcb') {
      modW = 90;
      modX = hxCenter - modW/2;
      vccCol = sn.col-1; sigCol = sn.col; gndCol = sn.col+1;
      const fillC = sn.color==='#3b82f6'?'#0e7490':(sn.color==='#ec4899'?'#5b21b6':'#1f6b43');
      s += `<rect x="${modX}" y="${modY}" width="${modW}" height="${modH}" rx="4" fill="${fillC}" stroke="#0a0a0a"/>`;
      s += T(modX+modW/2, modY+20, sn.name.split(' ')[1], {size:10, anchor:'middle', fill:'#fff', weight:700});
      s += T(modX+modW/2, modY+36, sn.name.split(' ')[0], {size:9, anchor:'middle', fill:'#fff', opacity:0.85});
    } else if (sn.type === 'ldr') {
      modW = 60;
      modX = hxCenter - modW/2;
      vccCol = sn.col-1; sigCol = sn.col; gndCol = -1; // GND 없음 (LDR는 2단자)
      // LDR — 동그라미
      s += `<circle cx="${hxCenter}" cy="${modY+25}" r="22" fill="#cfa55c" stroke="#5b3a14" stroke-width="1.5"/>`;
      s += `<path d="M ${hxCenter-12} ${modY+25} q 4 -10 8 0 t 8 0 t 8 0" fill="none" stroke="#1a1a1a" stroke-width="1.4"/>`;
      s += T(hxCenter, modY+60, 'GL5528', {size:10, anchor:'middle', weight:700});
    } else if (sn.type === 'cyl') {
      modW = 70;
      modX = hxCenter - modW/2;
      vccCol = sn.col-1; sigCol = sn.col; gndCol = sn.col+1;
      s += `<ellipse cx="${hxCenter}" cy="${modY+8}" rx="26" ry="6" fill="#8a8a8a"/>`;
      s += `<rect x="${hxCenter-26}" y="${modY+8}" width="52" height="32" fill="#a3a3a3" stroke="#666"/>`;
      s += `<ellipse cx="${hxCenter}" cy="${modY+40}" rx="26" ry="6" fill="#cbd5e1"/>`;
      s += T(hxCenter, modY+28, 'XKC-Y25-V', {size:9, anchor:'middle', fill:'#000', weight:700});
    } else if (sn.type === 'to92') {
      modW = 60;
      modX = hxCenter - modW/2;
      vccCol = sn.col-1; sigCol = sn.col; gndCol = sn.col+1;
      // TO-92 body
      const bx = hxCenter, by = modY+22;
      s += `<path d="M ${bx-22} ${by} Q ${bx} ${by-30}, ${bx+22} ${by} L ${bx+22} ${by+22} L ${bx-22} ${by+22} Z" fill="#1a1a1a"/>`;
      s += T(bx, by-8, 'DS18B20', {size:9, anchor:'middle', fill:'#fff', weight:700});
    }

    // 핀(다리) → 브레드보드 구멍
    if (vccCol >= 0) {
      const [vx, vy] = holeXY(vccCol, 0);
      s += `<line x1="${vx}" y1="${modY+modH}" x2="${vx}" y2="${vy-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
      s += T(vx, modY+modH+12, sn.rail==='5V'?'V+':'V', {size:9, anchor:'middle', fill:railColor, weight:700});
    }
    if (sigCol >= 0) {
      const [sx2, sy2] = holeXY(sigCol, 0);
      s += `<line x1="${sx2}" y1="${modY+modH}" x2="${sx2}" y2="${sy2-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
      s += T(sx2, modY+modH+12, 'S', {size:9, anchor:'middle', fill:sn.color, weight:700});
    }
    if (gndCol >= 0) {
      const [gx, gy] = holeXY(gndCol, 0);
      s += `<line x1="${gx}" y1="${modY+modH}" x2="${gx}" y2="${gy-4}" stroke="#c0c0c0" stroke-width="2.5"/>`;
      s += T(gx, modY+modH+12, 'G', {size:9, anchor:'middle', fill:GND_C, weight:700});
    }

    // VCC → 레일
    if (vccCol >= 0) {
      const [vx, vy] = holeXY(vccCol, 0);
      if (sn.rail === '5V') {
        // 아래쪽 + 레일로 (col vccCol에서 row 0 → 같은 col에서 아래로 거쳐 bottom + rail)
        // 브레드보드 내부에선 통과 못하므로 외곽으로 우회: row0 → gap 아래 row5~9로 점퍼? 너무 복잡.
        // 간단화: row 0 ↔ bottom rail은 그냥 색 점퍼선 1개 (시각적으로)
        s += `<path d="M ${vx} ${vy} L ${vx-8} ${vy+8} L ${vx-8} ${bprPosY-8} L ${vx} ${bprPosY-4}" fill="none" stroke="${V5}" stroke-width="3.5" stroke-linejoin="round"/>`;
      } else {
        s += `<line x1="${vx}" y1="${vy}" x2="${vx}" y2="${tprPosY+4}" stroke="${V33}" stroke-width="3.5"/>`;
      }
    }

    // GND → 위쪽 − 레일
    if (gndCol >= 0) {
      const [gx, gy] = holeXY(gndCol, 0);
      s += `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3.5"/>`;
    }

    // 분압 저항 + 신호 라우팅
    if (sn.type === 'pcb' || sn.type === 'cyl') {
      // 10k 직렬 (S → row2) + 20k 풀다운 (row2의 다른 col → top − rail) + 캡
      const [sx2, sy2] = holeXY(sigCol, 0);
      const [n1x, n1y] = holeXY(sigCol, 2);
      // 10k vertical between row0 and row2
      s += `<rect x="${sx2-9}" y="${(sy2+n1y)/2-12}" width="18" height="24" rx="3" fill="#e7d6a8" stroke="#8a6d1a"/>`;
      s += T(sx2+18, (sy2+n1y)/2+4, '10k', {size:9, fill:C.mute, weight:700});
      // 20k → GND
      const [n2x, n2y] = holeXY(sigCol+2, 2);
      s += `<line x1="${n1x}" y1="${n1y}" x2="${n2x}" y2="${n1y}" stroke="${sn.color}" stroke-width="3"/>`;
      s += `<line x1="${n2x}" y1="${n1y}" x2="${n2x}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;
      s += T(n2x+13, n1y+3, '20k', {size:9, fill:C.mute, weight:700});
      // 캡
      if (sn.cap) s += T(sx2-12, n1y+12, '‖ '+sn.cap, {size:9, fill:C.cap, weight:700, anchor:'end'});
      // Manhattan signal route: pin → channel → sigCol → down to node
      s += manhattan(sn.pin.x + (sn.io==='IO4' ? 12 : -12), sn.pin.y, sx2, sn.ch, sn.color, 4);
    } else if (sn.type === 'ldr') {
      // GL5528: VCC(다리1)→3.3V, 다리2→IO33 + 10k pulldown
      const [sx2, sy2] = holeXY(sigCol, 0);
      const [n2x, n2y] = holeXY(sigCol+2, 2);
      const [r1x, r1y] = holeXY(sigCol, 2);
      // 10k vertical
      s += `<line x1="${sx2}" y1="${sy2}" x2="${sx2}" y2="${r1y-12}" stroke="${sn.color}" stroke-width="3"/>`;
      s += `<rect x="${sx2-9}" y="${r1y-12}" width="18" height="24" rx="3" fill="#e7d6a8" stroke="#8a6d1a"/>`+T(sx2+18, r1y+4, '10k', {size:9, fill:C.mute, weight:700});
      s += `<line x1="${sx2}" y1="${r1y+12}" x2="${sx2}" y2="${n2y}" stroke="${GND_C}" stroke-width="3"/>`;
      s += `<line x1="${sx2}" y1="${n2y}" x2="${sx2}" y2="${tprNegY-4}" stroke="${GND_C}" stroke-width="3"/>`;
      // 0.1uF
      if (sn.cap) s += T(sx2-12, r1y+22, '‖ '+sn.cap, {size:9, fill:C.cap, weight:700, anchor:'end'});
      s += manhattan(sn.pin.x-12, sn.pin.y, sx2, sn.ch, sn.color, 4);
    } else if (sn.type === 'to92') {
      // DS18B20: VCC→3.3V, GND→GND, DATA→IO4, 4.7k 풀업 DATA↔3.3V
      const [sx2, sy2] = holeXY(sigCol, 0);
      const [r1x, r1y] = holeXY(sigCol, 1);
      const [r2x, r2y] = holeXY(sigCol-3, 1);
      // DATA → row1 (signal node)
      s += `<line x1="${sx2}" y1="${sy2}" x2="${sx2}" y2="${r1y}" stroke="${sn.color}" stroke-width="3"/>`;
      // 4.7k from row1(col=sigCol) ← row1(col=sigCol-3) → 3.3V rail at col sigCol-3
      const ry = r1y;
      s += `<rect x="${(r2x+r1x)/2-22}" y="${ry-9}" width="44" height="18" rx="9" fill="#e7d6a8" stroke="#8a6d1a"/>`;
      s += T((r1x+r2x)/2, ry-14, '4.7kΩ', {size:9.5, anchor:'middle', fill:C.warn, weight:700});
      // wire: r2x → r1x (the resistor body bridges them visually)
      s += `<line x1="${r2x}" y1="${ry}" x2="${(r2x+r1x)/2-22}" y2="${ry}" stroke="#c0c0c0" stroke-width="2"/>`;
      s += `<line x1="${(r1x+r2x)/2+22}" y1="${ry}" x2="${r1x}" y2="${ry}" stroke="#c0c0c0" stroke-width="2"/>`;
      // r2x → 3.3V rail (top + rail)
      s += `<line x1="${r2x}" y1="${ry}" x2="${r2x}" y2="${tprPosY+4}" stroke="${V33}" stroke-width="3"/>`;
      // IO4 signal route (오른쪽 핀)
      s += manhattan(sn.pin.x+12, sn.pin.y, sx2, sn.ch, sn.color, 4);
    }

    // 채널 라벨 (오른쪽 끝)
    s += T(bbX+bbW-6, sn.ch-3, sn.io, {size:10.5, anchor:'end', fill:sn.color, weight:700});

    // 센서 라벨 박스 (브레드보드 아래)
    const lblY = bbY + bbH + 18;
    s += `<rect x="${hxCenter-65}" y="${lblY}" width="130" height="44" rx="6" fill="#fff8e6" stroke="#e0b94a"/>`;
    s += T(hxCenter, lblY+18, sn.name, {size:11, anchor:'middle', weight:700});
    s += T(hxCenter, lblY+34, sn.rail+' · → '+sn.io, {size:10, anchor:'middle', fill:C.mute});
  }

  // 채널 가이드 라인 (옅게)
  for (let i = 0; i < CH.length; i++) {
    s += `<line x1="${bbX+20}" y1="${CH[i]}" x2="${bbX+bbW-50}" y2="${CH[i]}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3 4"/>`;
  }

  // ============ 범례 ============
  const lgX=60, lgY=H-100;
  s += `<rect x="${lgX}" y="${lgY}" width="${W-120}" height="76" rx="10" fill="#f9fafb" stroke="${C.boxStroke}"/>`;
  s += T(lgX+18, lgY+22, '점퍼선 색 의미 (Manhattan 라우팅 — 직각 꺾기, 교차 없음)', {size:13, weight:700, fill:C.accent});
  const legends = [
    ['3.3V 레일',V33], ['5V 레일',V5], ['GND',GND_C],
    ['pH→IO34',SG.pH], ['수위→IO35',SG.water], ['탁도→IO32',SG.turb], ['조도→IO33',SG.light], ['수온→IO4',SG.temp]
  ];
  legends.forEach((lg,i)=>{ const col=i%4, row=Math.floor(i/4); const x=lgX+20+col*460, y=lgY+50+row*22; s+=`<line x1="${x}" y1="${y}" x2="${x+34}" y2="${y}" stroke="${lg[1]}" stroke-width="5"/>`+T(x+42,y+4,lg[0],{size:11.5}); });
  s += T(W/2, H-26, '핵심: 센서를 ESP32 핀 순서로 배치 → 각 신호선이 자기 채널에서만 움직임 → 교차 0', {size:13, anchor:'middle', weight:700, fill:'#0f4c81'});

  return svgDoc(W, H, s);
}

// ================= 12V 펌프 플라이백 다이오드 연결법 (납땜 없음) =================
function buildPumpDiode() {
  const W=1400, H=1080;
  const POS='#d4453b', NEG='#1f2937', GREEN='#1f6b43';
  let s='';
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
  s += T(40,42,'12V 펌프 플라이백 다이오드 연결법 — 1N4007 한 개 · 납땜 없이 단자대로', {size:22, weight:700});
  s += T(40,68,'펌프 양단(+ / −)에 다이오드를 "거꾸로(역방향)" 병렬로 · 띠(흰색)가 펌프 (+) 쪽 · 단자대(스크류 터미널)에 같이 꽂으면 끝', {size:13.5, fill:C.mute});

  // ============ ① 왜 다는가 ============
  const wx=40, wy=110, ww=680, wh=180;
  s += T(wx, wy-8, '① 왜 다는가 — 릴레이가 끊기는 순간 역방향 스파이크 발생', {size:14, weight:700, fill:C.accent});
  s += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="10" fill="#fff8e6" stroke="#e0b94a"/>`;
  // 펌프 = 인덕터
  s += `<rect x="${wx+18}" y="${wy+34}" width="120" height="110" rx="60" fill="#fff" stroke="${C.ink}"/>`;
  s += T(wx+78, wy+66, '펌프 모터', {size:12, anchor:'middle', weight:700});
  s += T(wx+78, wy+84, '(코일/인덕터)', {size:11, anchor:'middle', fill:C.mute});
  s += T(wx+78, wy+118, '12V DC', {size:11, anchor:'middle', fill:C.mute});
  s += T(wx+160, wy+42, '· 모터 코일에 전류가 흐르다 갑자기 끊기면 ⚡', {size:12.5});
  s += T(wx+160, wy+62, '· 코일이 남은 에너지를 반대 방향으로 강하게 토해냄', {size:12.5});
  s += T(wx+160, wy+82, '· 수십~수백 V 스파이크 → 릴레이 접점 태움/노이즈', {size:12.5, fill:C.warn});
  s += T(wx+160, wy+108, '· 다이오드가 그 스파이크를 코일로 되돌려 안전하게 소모', {size:12.5});
  s += T(wx+160, wy+128, '· 한 번 달면 릴레이 수명↑ ESP32 리셋·튐↓', {size:12.5, fill:GREEN, weight:600});
  s += T(wx+160, wy+154, '· 부품 1개로 끝 (1N4007 · 100원 안팎)', {size:11.5, fill:C.mute});

  // ============ ② 회로도 ============
  const cx=40, cy=320, cw=680, ch=440;
  s += T(cx, cy-8, '② 회로도 — 다이오드는 펌프 양단에 "거꾸로" 병렬', {size:14, weight:700, fill:C.accent});
  s += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="10" fill="#fff" stroke="${C.boxStroke}"/>`;

  // 12V 어댑터 (왼쪽 위)
  const adx=cx+30, ady=cy+40;
  s += `<rect x="${adx}" y="${ady}" width="110" height="56" rx="6" fill="#f6f8fa" stroke="${C.ink}"/>`;
  s += T(adx+55, ady+24, '12V 어댑터', {size:12, anchor:'middle', weight:700});
  s += dot(adx+22, ady+56, POS, 4) + T(adx+22, ady+72, '+12V', {size:10.5, anchor:'middle', fill:POS, weight:700});
  s += dot(adx+88, ady+56, NEG, 4) + T(adx+88, ady+72, 'GND', {size:10.5, anchor:'middle', fill:NEG, weight:700});

  // 릴레이 접점 (가운데 위)
  const rxC=cx+260, ryC=cy+40;
  s += `<rect x="${rxC}" y="${ryC}" width="150" height="56" rx="6" fill="#eaf3ff" stroke="${C.accent}"/>`;
  s += T(rxC+75, ryC+24, '릴레이 접점', {size:12, anchor:'middle', weight:700, fill:C.accent});
  s += T(rxC+75, ryC+42, '(ESP32 ON/OFF)', {size:10.5, anchor:'middle', fill:C.mute});
  s += dot(rxC, ryC+28, POS, 4)+T(rxC-6, ryC+32, 'COM', {size:10.5, anchor:'end', fill:POS, weight:700});
  s += dot(rxC+150, ryC+28, POS, 4)+T(rxC+156, ryC+32, 'NO', {size:10.5, fill:POS, weight:700});

  // 펌프 (가운데, 위쪽으로 올림)
  const pxC=cx+260, pyC=cy+170, prw=180, prh=120;
  s += `<rect x="${pxC}" y="${pyC}" width="${prw}" height="${prh}" rx="50" fill="#fff" stroke="${C.ink}" stroke-width="1.5"/>`;
  s += T(pxC+prw/2, pyC+52, '12V 펌프', {size:14, anchor:'middle', weight:700});
  s += T(pxC+prw/2, pyC+72, '(모터)', {size:11, anchor:'middle', fill:C.mute});
  s += dot(pxC, pyC+34, POS, 4) + T(pxC-6, pyC+38, '(+)', {size:13, anchor:'end', weight:700, fill:POS});
  s += dot(pxC, pyC+86, NEG, 4) + T(pxC-6, pyC+90, '(−)', {size:13, anchor:'end', weight:700, fill:NEG});

  // 배선: +12V → COM (위쪽으로만 흐름)
  s += wire([[adx+22, ady+56],[adx+22, cy+150],[rxC-30, cy+150],[rxC-30, ryC+28],[rxC, ryC+28]], POS, 2.5);
  // NO → 펌프(+) : 오른쪽으로 내려갔다 왼쪽으로 와서 펌프 왼쪽 면으로 진입 (펌프 본체 안 가로지름)
  s += wire([[rxC+150, ryC+28],[rxC+180, ryC+28],[rxC+180, pyC+34-30],[pxC-30, pyC+34-30],[pxC-30, pyC+34],[pxC, pyC+34]], POS, 2.5);
  // 펌프(−) → adapter GND (왼쪽으로만)
  s += wire([[pxC, pyC+86],[adx+88, pyC+86],[adx+88, ady+56]], NEG, 2.5);

  // 다이오드 (펌프 오른쪽 옆에 세로)
  const dxC=pxC+prw+80, dyK=pyC+34, dyA=pyC+86;
  s += wire([[pxC+prw, pyC+34],[dxC, pyC+34],[dxC, dyK]], POS, 2.5);
  s += wire([[pxC+prw, pyC+86],[dxC, pyC+86],[dxC, dyA]], NEG, 2.5);
  s += `<polygon points="${dxC-14},${dyA-4} ${dxC+14},${dyA-4} ${dxC},${dyK+10}" fill="${C.ink}"/>`;
  s += `<line x1="${dxC-16}" y1="${dyK+10}" x2="${dxC+16}" y2="${dyK+10}" stroke="${C.ink}" stroke-width="3.5"/>`;
  s += T(dxC+22, dyK-2, 'K (캐소드) = 흰 띠', {size:11.5, fill:POS, weight:700});
  s += T(dxC+22, dyK+16, '→ 펌프 (+) 쪽', {size:11, fill:POS});
  s += T(dxC+22, dyA+4, 'A (애노드)', {size:11.5, fill:NEG, weight:700});
  s += T(dxC+22, dyA+22, '→ 펌프 (−) 쪽', {size:11, fill:NEG});
  s += T(dxC, dyK-22, '1N4007', {size:13, anchor:'middle', weight:700});

  // 동작 설명 박스 — 회로도 맨 아래에 가로로 펼침 (펌프와 안 겹침)
  const opY = cy+ch-104;
  s += `<rect x="${cx+20}" y="${opY}" width="${cw-40}" height="86" rx="8" fill="#eef7f0" stroke="${GREEN}"/>`;
  s += T(cx+34, opY+24, '동작', {size:13, weight:700, fill:GREEN});
  s += T(cx+34, opY+46, '· 평상시(릴레이 ON, 전류 흐름 中): 다이오드는 역방향 → 차단 (전류 X)', {size:12});
  s += T(cx+34, opY+64, '· 릴레이 OFF 순간: 코일이 만든 역스파이크가 순방향 → 다이오드로 빠져 안전히 소모', {size:12});
  s += T(cx+34, opY+82, '· 다이오드가 없으면 그 스파이크가 릴레이 접점을 태움(아크) + ESP32까지 노이즈 유입', {size:12, fill:C.warn});

  // ============ ③ 1N4007 실제 모양 ============
  const ix=740, iy=110, iw=620, ih=320;
  s += T(ix, iy-8, '③ 1N4007 실제 모양 — 흰 띠가 K(캐소드), 그게 펌프 (+) 쪽', {size:14, weight:700, fill:C.accent});
  s += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="10" fill="#fff" stroke="${C.boxStroke}"/>`;
  const dcx=ix+iw/2, dcy=iy+150;
  // 다리
  s += `<line x1="${dcx-170}" y1="${dcy}" x2="${dcx-70}" y2="${dcy}" stroke="#9ca3af" stroke-width="3"/>`;
  s += `<line x1="${dcx+70}" y1="${dcy}" x2="${dcx+170}" y2="${dcy}" stroke="#9ca3af" stroke-width="3"/>`;
  // 몸통
  s += `<rect x="${dcx-70}" y="${dcy-26}" width="140" height="52" rx="6" fill="#1f1f1f"/>`;
  // 흰 띠 (K쪽=오른쪽)
  s += `<rect x="${dcx+38}" y="${dcy-26}" width="16" height="52" fill="#ffffff"/>`;
  // 글자
  s += T(dcx-10, dcy+5, '1N4007', {size:14, anchor:'middle', fill:'#fff', weight:700});
  // 띠 강조 (위쪽에 화살표)
  s += `<path d="M ${dcx+46} ${dcy-52} L ${dcx+46} ${dcy-32}" stroke="${POS}" stroke-width="2.5"/>`;
  s += `<polygon points="${dcx+42},${dcy-34} ${dcx+50},${dcy-34} ${dcx+46},${dcy-26}" fill="${POS}"/>`;
  s += T(dcx+46, dcy-58, '이 띠가 +쪽', {size:11.5, anchor:'middle', fill:POS, weight:700});
  // 양쪽 라벨 (아래로)
  s += T(dcx-170, dcy+30, 'A (애노드)', {size:13, anchor:'start', fill:NEG, weight:700});
  s += T(dcx-170, dcy+50, '→ 펌프 (−)에', {size:12, fill:NEG});
  s += T(dcx+170, dcy+30, 'K (캐소드)', {size:13, anchor:'end', fill:POS, weight:700});
  s += T(dcx+170, dcy+50, '→ 펌프 (+)에', {size:12, anchor:'end', fill:POS});
  // 사양 안내 (하단 별도 줄)
  s += T(ix+24, iy+ih-78, '· 1N4007 = 1A · 1000V — 12V 펌프엔 충분', {size:12.5});
  s += T(ix+24, iy+ih-58, '· 펌프 소비전류 1A 초과 시 1N5408(3A) 또는 SR360(쇼트키)', {size:12.5});
  s += T(ix+24, iy+ih-38, '· 검정 원통, 다리 2개. 띠 위치만 보면 방향을 알 수 있음', {size:12.5, fill:C.mute});
  s += T(ix+24, iy+ih-16, '⚠ 거꾸로 꽂으면 평상시에도 단락 → 다이오드 즉사 / 릴레이 손상', {size:12.5, fill:C.warn, weight:600});

  // ============ ④ 납땜 없이 — 단자대(스크류 터미널)로 ============
  const sx=740, sy=460, sw=620, sh=300;
  s += T(sx, sy-8, '④ 납땜 없이 연결 — 단자대(스크류 터미널)에 같이 꽂기', {size:14, weight:700, fill:C.accent});
  s += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="10" fill="#fff" stroke="${C.boxStroke}"/>`;

  // 단자대 그림 (2P 스크류 터미널)
  const tbx=sx+170, tby=sy+50, tbw=220, tbh=90;
  s += `<rect x="${tbx}" y="${tby}" width="${tbw}" height="${tbh}" rx="6" fill="#1a73a8" stroke="#0f4c81" stroke-width="1.5"/>`;
  s += T(tbx+tbw/2, tby+18, '2P 스크류 단자대 (KF301-2P 등)', {size:12, anchor:'middle', fill:'#fff', weight:700});
  // 두 구멍 (앞면 와이어 진입구) - 진한 회색
  const holeY=tby+50, holeR=14;
  const h1x=tbx+60, h2x=tbx+tbw-60;
  s += `<circle cx="${h1x}" cy="${holeY}" r="${holeR}" fill="#0b0b0b"/>`;
  s += `<circle cx="${h2x}" cy="${holeY}" r="${holeR}" fill="#0b0b0b"/>`;
  // 스크류 위쪽
  s += `<circle cx="${h1x}" cy="${tby+18+8}" r="8" fill="#d4d4d4" stroke="#666"/>`;
  s += `<line x1="${h1x-5}" y1="${tby+26}" x2="${h1x+5}" y2="${tby+26}" stroke="#333" stroke-width="2"/>`;
  s += `<circle cx="${h2x}" cy="${tby+18+8}" r="8" fill="#d4d4d4" stroke="#666"/>`;
  s += `<line x1="${h2x-5}" y1="${tby+26}" x2="${h2x+5}" y2="${tby+26}" stroke="#333" stroke-width="2"/>`;
  // 라벨
  s += T(h1x, tby+tbh+18, '(+) 단자', {size:12, anchor:'middle', fill:POS, weight:700});
  s += T(h2x, tby+tbh+18, '(−) 단자', {size:12, anchor:'middle', fill:NEG, weight:700});

  // 왼쪽: 펌프
  s += `<rect x="${sx+20}" y="${sy+62}" width="100" height="80" rx="40" fill="#cbd5e1" stroke="${C.ink}"/>`;
  s += T(sx+70, sy+102, '12V 펌프', {size:12, anchor:'middle', weight:700});
  // 펌프 두 선 → 단자대
  s += wire([[sx+120, sy+82],[h1x, sy+82],[h1x, holeY-holeR]], POS, 3);  // 빨강 → (+)구멍
  s += wire([[sx+120, sy+122],[h2x, sy+122],[h2x, holeY-holeR]], NEG, 3); // 검정 → (−)구멍
  s += T(sx+128, sy+76, '빨강(+)', {size:10.5, fill:POS, weight:700});
  s += T(sx+128, sy+138, '검정(−)', {size:10.5, fill:NEG, weight:700});

  // 오른쪽: 릴레이/12V어댑터에서 오는 선 → 같은 단자대
  s += wire([[h1x, holeY-holeR],[h1x, sy+220]], POS, 3);   // (+)구멍에서 아래로
  s += wire([[h2x, holeY-holeR],[h2x, sy+220]], NEG, 3);
  // 정확하게는 위에서 들어오는 선이지만 시각적으로 단순화: 같은 구멍에서 또 와이어가 나옴
  s += T(h1x, sy+240, '→ 릴레이 NO', {size:11, anchor:'middle', fill:POS, weight:700});
  s += T(h2x, sy+240, '→ 12V GND', {size:11, anchor:'middle', fill:NEG, weight:700});

  // 다이오드 (단자대 위에 같이 꽂기) — 펌프 (+) 구멍 ↔ (−) 구멍 사이
  const dyx1=h1x, dyx2=h2x;
  const dgY=sy+170;  // 다이오드 본체 y
  // 다이오드 다리 (양옆으로 구부려서 두 구멍으로)
  s += `<line x1="${dyx1}" y1="${dgY+8}" x2="${dyx1}" y2="${holeY}" stroke="#9ca3af" stroke-width="2.5"/>`;
  s += `<line x1="${dyx2}" y1="${dgY+8}" x2="${dyx2}" y2="${holeY}" stroke="#9ca3af" stroke-width="2.5"/>`;
  // 다이오드 몸통 (가로) — 띠는 왼쪽(=+ 단자 쪽)
  const dbY=dgY-10;
  s += `<line x1="${dyx1}" y1="${dgY}" x2="${dyx1+18}" y2="${dgY}" stroke="#9ca3af" stroke-width="2.5"/>`;
  s += `<line x1="${dyx2-18}" y1="${dgY}" x2="${dyx2}" y2="${dgY}" stroke="#9ca3af" stroke-width="2.5"/>`;
  s += `<rect x="${dyx1+18}" y="${dgY-10}" width="${dyx2-dyx1-36}" height="20" rx="3" fill="#1f1f1f"/>`;
  s += `<rect x="${dyx1+18}" y="${dgY-10}" width="8" height="20" fill="#ffffff"/>`;  // 띠 = 왼쪽(+) 쪽
  s += T((dyx1+dyx2)/2, dgY+5, '1N4007', {size:10.5, anchor:'middle', fill:'#fff', weight:700});
  s += T(dyx1+22, dgY-18, '↑ 띠 (K) → (+) 단자', {size:11, fill:POS, weight:700});

  // 안내 텍스트 (하단)
  s += T(sx+22, sy+sh-68, '· 펌프 빨강선 + 다이오드 띠 쪽 다리 → 같은 (+) 단자 구멍에 같이 꽂고 스크류 조임', {size:12.5});
  s += T(sx+22, sy+sh-48, '· 펌프 검정선 + 다이오드 반대 쪽 다리 → 같은 (−) 단자 구멍에 같이 꽂고 조임', {size:12.5});
  s += T(sx+22, sy+sh-28, '· 같은 단자에 릴레이 NO 선과 12V GND 선도 함께 들어옴 (한 구멍에 2~3가닥 OK)', {size:12.5});
  s += T(sx+22, sy+sh-10, '대안: Wago 레버 커넥터 / 무납땜 일자 단자(돼지꼬리) 도 동일한 원리로 사용 가능', {size:11.5, fill:C.mute});

  // ============ ⑤ 좋은 예 / 나쁜 예 ============
  const yx=40, yy=800, yw=1320, yh=210;
  s += T(yx, yy-8, '⑤ 방향 확인 — 좋은 예 / 나쁜 예', {size:14, weight:700, fill:C.accent});
  const gw=650;
  // 좋은 예
  s += `<rect x="${yx}" y="${yy}" width="${gw}" height="${yh}" rx="10" fill="#eef7f0" stroke="${GREEN}"/>`;
  s += T(yx+18, yy+28, '✅ 좋은 예 — 띠(K)가 펌프 (+) 쪽', {size:14, weight:700, fill:GREEN});
  // 미니회로
  const gpx=yx+50, gpy=yy+110;
  s += `<rect x="${gpx}" y="${gpy-26}" width="90" height="52" rx="26" fill="#fff" stroke="${C.ink}"/>`;
  s += T(gpx+45, gpy+4, '펌프', {size:12, anchor:'middle', weight:700});
  s += dot(gpx+90, gpy-12, POS, 3.5)+T(gpx+98, gpy-9, '+', {size:13, fill:POS, weight:700});
  s += dot(gpx+90, gpy+16, NEG, 3.5)+T(gpx+98, gpy+20, '−', {size:13, fill:NEG, weight:700});
  // 다이오드(가로) — 띠가 왼쪽(= 펌프 + 쪽)
  const gdx=gpx+220, gdy=gpy;
  s += `<line x1="${gdx-60}" y1="${gdy-12}" x2="${gdx-22}" y2="${gdy-12}" stroke="${POS}" stroke-width="2.5"/>`;
  s += `<line x1="${gdx-60}" y1="${gdy+16}" x2="${gdx-22}" y2="${gdy+16}" stroke="${NEG}" stroke-width="2.5"/>`;
  s += `<line x1="${gdx-22}" y1="${gdy-12}" x2="${gdx-22}" y2="${gdy+16}" stroke="${POS}" stroke-width="2.5"/>`;
  s += `<line x1="${gdx+22}" y1="${gdy-12}" x2="${gdx+22}" y2="${gdy+16}" stroke="${NEG}" stroke-width="2.5"/>`;
  s += `<rect x="${gdx-22}" y="${gdy-8}" width="44" height="22" rx="3" fill="#1f1f1f"/>`;
  s += `<rect x="${gdx-22}" y="${gdy-8}" width="8" height="22" fill="#fff"/>`;
  s += T(gdx-18, gdy-18, '↑ 띠', {size:11, fill:POS, weight:700});
  s += T(yx+18, yy+175, '평상시: 차단 · 끊는 순간: 흡수 → 정상 동작', {size:12.5, fill:GREEN, weight:600});

  // 나쁜 예
  const bx2=yx+gw+20, bw=yw-gw-20;
  s += `<rect x="${bx2}" y="${yy}" width="${bw}" height="${yh}" rx="10" fill="#fff5f4" stroke="${C.warn}"/>`;
  s += T(bx2+18, yy+28, '❌ 나쁜 예 — 띠가 (−) 쪽으로 거꾸로', {size:14, weight:700, fill:C.warn});
  const bpx=bx2+50, bpy=yy+110;
  s += `<rect x="${bpx}" y="${bpy-26}" width="90" height="52" rx="26" fill="#fff" stroke="${C.ink}"/>`;
  s += T(bpx+45, bpy+4, '펌프', {size:12, anchor:'middle', weight:700});
  s += dot(bpx+90, bpy-12, POS, 3.5)+T(bpx+98, bpy-9, '+', {size:13, fill:POS, weight:700});
  s += dot(bpx+90, bpy+16, NEG, 3.5)+T(bpx+98, bpy+20, '−', {size:13, fill:NEG, weight:700});
  const bdx=bpx+220, bdy=bpy;
  s += `<line x1="${bdx-60}" y1="${bdy-12}" x2="${bdx-22}" y2="${bdy-12}" stroke="${POS}" stroke-width="2.5"/>`;
  s += `<line x1="${bdx-60}" y1="${bdy+16}" x2="${bdx-22}" y2="${bdy+16}" stroke="${NEG}" stroke-width="2.5"/>`;
  s += `<line x1="${bdx-22}" y1="${bdy-12}" x2="${bdx-22}" y2="${bdy+16}" stroke="${POS}" stroke-width="2.5"/>`;
  s += `<line x1="${bdx+22}" y1="${bdy-12}" x2="${bdx+22}" y2="${bdy+16}" stroke="${NEG}" stroke-width="2.5"/>`;
  s += `<rect x="${bdx-22}" y="${bdy-8}" width="44" height="22" rx="3" fill="#1f1f1f"/>`;
  s += `<rect x="${bdx+14}" y="${bdy-8}" width="8" height="22" fill="#fff"/>`;  // 띠가 오른쪽(− 쪽)
  s += T(bdx+18, bdy-18, '↑ 띠(거꾸로)', {size:11, anchor:'end', fill:C.warn, weight:700});
  // 폭발
  s += T(bdx+90, bdy+5, '💥', {size:28, anchor:'middle'});
  s += T(bx2+18, yy+150, '평상시에도 단락 → 다이오드 즉사 · 릴레이/어댑터 손상 가능', {size:12.5, fill:C.warn, weight:600});
  s += T(bx2+18, yy+175, '연기·열·과전류 발생 → 즉시 전원 차단하고 방향 확인', {size:12.5, fill:C.warn});

  // 하단 결론
  s += T(W/2, H-26, '핵심: 1N4007 한 개 · 띠(흰색 K)가 펌프 (+) 쪽 · 펌프 두 선과 함께 단자대 (+)/(−) 구멍에 같이 꽂으면 끝', {size:13.5, anchor:'middle', weight:700, fill:'#0f4c81'});

  return svgDoc(W,H,s);
}

// ================= 디커플링 커패시터 설치법 (사실적 그림) =================
function buildDecoupling() {
  const W=1280, H=900;
  const VCC='#d4453b', GND='#1f2937', BLUE='#1e3a8a';
  let s='';
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
  s += T(40,42,'디커플링 커패시터 설치법 — 릴레이 모듈 VCC ↔ GND 사이에 다는 법', {size:22, weight:700});
  s += T(40,68,'전해(10µF) + 세라믹(0.1µF=104)을 병렬로 · 릴레이에 최대한 가깝게 · 전해는 ─ 띠가 GND', {size:13.5, fill:C.mute});

  // ============ 좌측: 브레드보드 위에 실제 꽂은 모습 (탑뷰) ============
  const bx=40, by=110, bw=720, bh=440;
  s += T(bx, by-8, '① 브레드보드 탑뷰 (실제 꽂는 모습)', {size:14, weight:700, fill:C.accent});
  // 보드 베이스
  s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="14" fill="#f5efe2" stroke="#c9b88d" stroke-width="1.5"/>`;
  // 파워레일 (위) : + (빨강) / − (파랑)
  const rPlusY = by+34, rMinusY = by+62;
  s += `<line x1="${bx+20}" y1="${rPlusY}"  x2="${bx+bw-20}" y2="${rPlusY}"  stroke="${VCC}" stroke-width="2.6"/>`;
  s += `<line x1="${bx+20}" y1="${rMinusY}" x2="${bx+bw-20}" y2="${rMinusY}" stroke="${BLUE}" stroke-width="2.6"/>`;
  s += T(bx+10, rPlusY+5, '+', {size:18, fill:VCC, weight:700});
  s += T(bx+10, rMinusY+5, '−', {size:18, fill:BLUE, weight:700});
  // 구멍 그리기 (위 레일)
  for (let i=0;i<60;i++){ const X=bx+30+i*11;
    s += `<circle cx="${X}" cy="${rPlusY}"  r="1.6" fill="#1f2937"/>`;
    s += `<circle cx="${X}" cy="${rMinusY}" r="1.6" fill="#1f2937"/>`;
  }
  // 메인 영역(터미널 스트립) 구멍 격자
  const stripY = by+100, stripH = 220;
  for (let r=0;r<14;r++) for (let i=0;i<60;i++){
    const X=bx+30+i*11, Y=stripY+10+r*15;
    s += `<circle cx="${X}" cy="${Y}" r="1.4" fill="#9ca3af"/>`;
  }
  // 가운데 골(gap)
  s += `<rect x="${bx+20}" y="${stripY+105}" width="${bw-40}" height="10" fill="#e5d8b3"/>`;

  // 릴레이 모듈 (브레드보드 우측에 박힌 듯)
  const rmx = bx+bw-220, rmy = by+90, rmw = 200, rmh = 240;
  s += `<rect x="${rmx}" y="${rmy}" width="${rmw}" height="${rmh}" rx="6" fill="#0b6b41" stroke="#063b25" stroke-width="1.5"/>`;
  s += T(rmx+rmw/2, rmy+22, '3채널 릴레이 모듈', {size:13.5, anchor:'middle', fill:'#fff', weight:700});
  s += T(rmx+rmw/2, rmy+40, '(윗면, 보드 위에 꽂힘)', {size:11, anchor:'middle', fill:'#b9f0d0'});
  // 릴레이 3개 박스 표현
  for (let i=0;i<3;i++){
    const rax = rmx+18+i*60, ray = rmy+58;
    s += `<rect x="${rax}" y="${ray}" width="48" height="80" rx="3" fill="#1f6b43" stroke="#000"/>`;
    s += T(rax+24, ray+46, 'CH'+(i+1), {size:11.5, anchor:'middle', fill:'#fff', weight:700});
  }
  // 모듈 핀 헤더 (브레드보드에 꽂히는 5핀) — VCC GND IN1 IN2 IN3
  const pinY = rmy+rmh;          // 모듈 하단
  const pinNames=['VCC','GND','IN1','IN2','IN3'];
  const pinColors=[VCC,BLUE,C.sig,C.sig,C.sig];
  const pinXs = pinNames.map((_,i)=> rmx+22+i*39);
  pinNames.forEach((n,i)=>{
    const X = pinXs[i];
    s += `<rect x="${X-5}" y="${pinY-8}" width="10" height="22" fill="#222"/>`;     // 핀 헤더
    s += `<circle cx="${X}" cy="${pinY+22}" r="3.6" fill="#d4a017" stroke="#7a5d05"/>`; // 보드구멍에 꽂힌 핀
    s += T(X, pinY-12, n, {size:11, anchor:'middle', fill:'#fff', weight:700});
  });

  // 커패시터를 "릴레이 핀 바로 옆 줄"에 꽂은 모습
  // 10µF 전해 — VCC 핀 옆에서 + 다리는 VCC 줄, − 다리는 GND 줄
  const capCol1 = pinXs[0]+22;   // VCC 옆 칸
  const capCol2 = pinXs[0]+44;   // 그 옆 칸(세라믹)
  // 전해 통(원통) — 노란라벨 + 검정 음극 띠
  function electrolytic(cx, cy){
    // 양쪽 다리(VCC와 GND 줄로 가는 와이어)
    let g='';
    // body
    g+=`<ellipse cx="${cx}" cy="${cy-50}" rx="22" ry="6" fill="#1f1f1f"/>`;
    g+=`<rect x="${cx-22}" y="${cy-50}" width="44" height="48" fill="#1f1f1f"/>`;
    // 라벨(연한 회색)
    g+=`<rect x="${cx-22}" y="${cy-46}" width="44" height="36" fill="#e7e3c9"/>`;
    g+=T(cx, cy-30, '10µF', {size:11, anchor:'middle', weight:700});
    g+=T(cx, cy-18, '25V', {size:9, anchor:'middle', fill:'#444'});
    // 음극(−) 띠 — GND쪽 표시
    g+=`<rect x="${cx+8}" y="${cy-46}" width="14" height="36" fill="#1f1f1f"/>`;
    g+=T(cx+15, cy-25, '−', {size:13, anchor:'middle', fill:'#fff', weight:700});
    // 다리
    g+=`<line x1="${cx-12}" y1="${cy-4}" x2="${cx-12}" y2="${cy+22}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    g+=`<line x1="${cx+12}" y1="${cy-4}" x2="${cx+12}" y2="${cy+22}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    // + / − 다리 라벨
    g+=T(cx-12, cy-58, '+', {size:14, anchor:'middle', fill:VCC, weight:700});
    g+=T(cx+12, cy-58, '−', {size:14, anchor:'middle', fill:BLUE, weight:700});
    return g;
  }
  // 세라믹 — 작은 노란 디스크
  function ceramic(cx, cy){
    let g='';
    g+=`<ellipse cx="${cx}" cy="${cy-30}" rx="18" ry="14" fill="#d9b22a" stroke="#7a5d05"/>`;
    g+=T(cx, cy-26, '104', {size:11, anchor:'middle', weight:700});
    g+=`<line x1="${cx-8}" y1="${cy-18}" x2="${cx-8}" y2="${cy+22}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    g+=`<line x1="${cx+8}" y1="${cy-18}" x2="${cx+8}" y2="${cy+22}" stroke="#c0c0c0" stroke-width="2.5"/>`;
    g+=T(cx, cy-44, '0.1µF', {size:11, anchor:'middle'});
    g+=T(cx, cy+34, '(극성 없음)', {size:9.5, anchor:'middle', fill:C.mute});
    return g;
  }
  // 커패시터를 브레드보드의 +/− 레일 위에 다리가 꽂힌 것처럼
  // capCol1 위치: VCC 핀 바로 옆 — 전해를 여기에
  const capY = rPlusY;   // 위 레일 라인 y
  // 다리 끝(=꽂힌 구멍) 점
  s += dot(capCol1-12, rPlusY, VCC, 3.4);
  s += dot(capCol1+12, rMinusY, BLUE, 3.4);
  s += electrolytic(capCol1, rPlusY-2);
  // 세라믹은 그 옆 칸에 꽂음
  s += dot(capCol2-8, rPlusY, VCC, 3.4);
  s += dot(capCol2+8, rMinusY, BLUE, 3.4);
  s += ceramic(capCol2, rPlusY-4);

  // 릴레이 VCC/GND 핀 → 레일까지의 연결(점퍼선)
  // VCC 핀이 +레일과 같은 세로줄 위에 있다고 가정: 실선으로 표시
  s += wire([[pinXs[0], pinY+22],[pinXs[0], rPlusY]], VCC, 2.4);    // VCC → +레일
  s += wire([[pinXs[1], pinY+22],[pinXs[1], rMinusY]], BLUE, 2.4);  // GND → −레일
  // 화살표/라벨
  s += T(pinXs[0]+6, pinY+50, 'VCC → +레일', {size:10.5, fill:VCC, weight:600});
  s += T(pinXs[1]+6, pinY+66, 'GND → −레일', {size:10.5, fill:BLUE, weight:600});

  // 거리 표시(릴레이에 가까이!)
  s += `<path d="M ${pinXs[0]} ${pinY+8} q -40 -40 -80 -10" fill="none" stroke="${C.ok}" stroke-width="2" stroke-dasharray="4 4"/>`;
  s += T(pinXs[0]-90, pinY-2, '← 가까이!', {size:12, fill:C.ok, weight:700, anchor:'end'});
  s += T(pinXs[0]-90, pinY+14, '(거리=짧을수록 좋음)', {size:10, fill:C.ok, anchor:'end'});

  // ESP32 (왼쪽에서 +/− 레일에 5V·GND 공급)
  const ex=bx+30, ey=by+360, ew=160, eh=70;
  s += `<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" rx="8" fill="#1e293b"/>`;
  s += T(ex+ew/2, ey+22, 'ESP32', {size:13, anchor:'middle', fill:'#fff', weight:700});
  s += T(ex+ew/2, ey+44, '5V → +레일 / GND → −레일', {size:10, anchor:'middle', fill:'#cbd5e1'});
  // 점퍼선 (ESP32 → 레일들)
  s += wire([[ex+ew, ey+22],[bx+10, ey+22],[bx+10, rPlusY],[bx+30, rPlusY]], VCC, 2.6);
  s += wire([[ex+ew, ey+50],[bx+18, ey+50],[bx+18, rMinusY],[bx+30, rMinusY]], BLUE, 2.6);

  // ============ 우측 상단: 회로도 = 등가 ============
  const sx=800, sy=110, sw=440, sh=240;
  s += T(sx, sy-8, '② 회로도(등가) — 두 커패시터를 병렬로', {size:14, weight:700, fill:C.accent});
  s += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="10" fill="#fff" stroke="${C.boxStroke}"/>`;
  // VCC 가로선
  const v=sy+60, g=sy+sh-50;
  s += `<line x1="${sx+30}" y1="${v}" x2="${sx+sw-30}" y2="${v}" stroke="${VCC}" stroke-width="3"/>`;
  s += T(sx+22, v+4, '5V', {size:12, anchor:'end', fill:VCC, weight:700});
  s += `<line x1="${sx+30}" y1="${g}" x2="${sx+sw-30}" y2="${g}" stroke="${BLUE}" stroke-width="3"/>`;
  s += T(sx+22, g+4, 'GND', {size:12, anchor:'end', fill:BLUE, weight:700});
  // ESP32 측
  s += `<rect x="${sx+30}" y="${(v+g)/2-22}" width="80" height="44" rx="6" fill="#1e293b"/>`;
  s += T(sx+70, (v+g)/2+5, 'ESP32', {size:12, anchor:'middle', fill:'#fff', weight:700});
  // 전해 캡
  const cx1=sx+220;
  s += `<line x1="${cx1}" y1="${v}" x2="${cx1}" y2="${(v+g)/2-12}" stroke="${VCC}" stroke-width="2"/>`;
  s += `<line x1="${cx1-16}" y1="${(v+g)/2-12}" x2="${cx1+16}" y2="${(v+g)/2-12}" stroke="#000" stroke-width="3"/>`;
  s += `<path d="M ${cx1-16} ${(v+g)/2+4} q 16 10 32 0" fill="none" stroke="#000" stroke-width="2.5"/>`;
  s += `<line x1="${cx1}" y1="${(v+g)/2+10}" x2="${cx1}" y2="${g}" stroke="${BLUE}" stroke-width="2"/>`;
  s += T(cx1-22, (v+g)/2-18, '+', {size:13, anchor:'end', fill:VCC, weight:700});
  s += T(cx1, sy+28, '10µF', {size:12, anchor:'middle', weight:700});
  s += T(cx1, sy+sh-22, '(전해·극성有)', {size:10, anchor:'middle', fill:C.mute});
  // 세라믹
  const cx2=sx+300;
  s += `<line x1="${cx2}" y1="${v}" x2="${cx2}" y2="${(v+g)/2-10}" stroke="${VCC}" stroke-width="2"/>`;
  s += `<line x1="${cx2-14}" y1="${(v+g)/2-10}" x2="${cx2+14}" y2="${(v+g)/2-10}" stroke="#000" stroke-width="3"/>`;
  s += `<line x1="${cx2-14}" y1="${(v+g)/2-2}"  x2="${cx2+14}" y2="${(v+g)/2-2}"  stroke="#000" stroke-width="3"/>`;
  s += `<line x1="${cx2}" y1="${(v+g)/2+2}" x2="${cx2}" y2="${g}" stroke="${BLUE}" stroke-width="2"/>`;
  s += T(cx2, sy+28, '0.1µF', {size:12, anchor:'middle', weight:700});
  s += T(cx2, sy+sh-22, '(세라믹)', {size:10, anchor:'middle', fill:C.mute});
  // 릴레이 모듈
  s += `<rect x="${sx+sw-90}" y="${(v+g)/2-22}" width="70" height="44" rx="6" fill="#0b6b41"/>`;
  s += T(sx+sw-55, (v+g)/2+5, '릴레이', {size:12, anchor:'middle', fill:'#fff', weight:700});
  // 화살표(가까이!)
  s += T(sx+sw-160, v-10, '두 캡은 릴레이 쪽에 ▶', {size:11, fill:C.ok, weight:700});

  // ============ 우측 중간: 극성 디테일 ============
  const dx=800, dy=380, dw=440, dh=170;
  s += T(dx, dy-8, '③ 전해 커패시터 극성 (10µF) — 띠가 GND', {size:14, weight:700, fill:C.accent});
  s += `<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" rx="10" fill="#fff" stroke="${C.boxStroke}"/>`;
  // 큰 전해 캡 그림
  const ecx=dx+110, ecy=dy+95;
  s += `<ellipse cx="${ecx}" cy="${ecy-46}" rx="44" ry="10" fill="#1f1f1f"/>`;
  s += `<rect x="${ecx-44}" y="${ecy-46}" width="88" height="60" fill="#1f1f1f"/>`;
  s += `<rect x="${ecx-44}" y="${ecy-40}" width="88" height="42" fill="#e7e3c9"/>`;
  s += T(ecx-15, ecy-18, '10µF', {size:13, anchor:'middle', weight:700});
  // 음극 띠
  s += `<rect x="${ecx+16}" y="${ecy-40}" width="28" height="42" fill="#1f1f1f"/>`;
  s += T(ecx+30, ecy-12, '−', {size:18, anchor:'middle', fill:'#fff', weight:700});
  // 다리(길이 차이)
  s += `<line x1="${ecx-22}" y1="${ecy+14}" x2="${ecx-22}" y2="${ecy+58}" stroke="#c0c0c0" stroke-width="3"/>`;   // 긴 다리(+)
  s += `<line x1="${ecx+22}" y1="${ecy+14}" x2="${ecx+22}" y2="${ecy+44}" stroke="#c0c0c0" stroke-width="3"/>`;   // 짧은 다리(−)
  s += T(ecx-22, ecy+72, '긴 다리 = + → VCC', {size:11.5, anchor:'middle', fill:VCC, weight:700});
  s += T(ecx+22, ecy+58, '짧은 다리 = − → GND', {size:11.5, anchor:'middle', fill:BLUE, weight:700});
  // 설명
  s += T(dx+220, dy+30, '· 통 옆 검정 띠 = − (음극)', {size:12.5});
  s += T(dx+220, dy+50, '· 긴 다리 = + (양극)', {size:12.5});
  s += T(dx+220, dy+74, '· 거꾸로 꽂으면 부풀거나 터질 수 있음', {size:12, fill:C.warn, weight:600});
  s += T(dx+220, dy+98, '· 세라믹 0.1µF는 극성 없음 (아무 방향)', {size:12});
  s += T(dx+220, dy+128, '· "104" 인쇄가 0.1µF의 표기', {size:11.5, fill:C.mute});

  // ============ 하단: 좋은 예 / 나쁜 예 ============
  const yx=40, yy=580, yw=1200, yh=170;
  s += T(yx, yy-8, '④ 좋은 예 / 나쁜 예', {size:14, weight:700, fill:C.accent});
  // 좋은 예
  const gx=yx, gw=590;
  s += `<rect x="${gx}" y="${yy}" width="${gw}" height="${yh}" rx="10" fill="#eef7f0" stroke="${C.ok}"/>`;
  s += T(gx+18, yy+28, '✅ 좋은 예 — 릴레이 핀 바로 옆에', {size:13.5, weight:700, fill:C.ok});
  // 작은 그림: ESP32 ─── 길게 ─── 레일에서 릴레이 핀 옆에 캡
  s += `<rect x="${gx+18}" y="${yy+50}" width="60" height="32" rx="4" fill="#1e293b"/>`;
  s += T(gx+48, yy+71, 'ESP32', {size:10.5, anchor:'middle', fill:'#fff', weight:700});
  s += `<line x1="${gx+78}" y1="${yy+58}" x2="${gx+460}" y2="${yy+58}" stroke="${VCC}" stroke-width="3"/>`;
  s += `<line x1="${gx+78}" y1="${yy+78}" x2="${gx+460}" y2="${yy+78}" stroke="${BLUE}" stroke-width="3"/>`;
  // 캡 (릴레이 옆)
  s += `<rect x="${gx+400}" y="${yy+48}" width="14" height="36" fill="#1f1f1f"/>`;
  s += `<line x1="${gx+390}" y1="${yy+58}" x2="${gx+390}" y2="${yy+78}" stroke="#000" stroke-width="3"/>`;
  s += `<line x1="${gx+396}" y1="${yy+58}" x2="${gx+396}" y2="${yy+78}" stroke="#000" stroke-width="3"/>`;
  // 릴레이
  s += `<rect x="${gx+460}" y="${yy+44}" width="100" height="50" rx="4" fill="#0b6b41"/>`;
  s += T(gx+510, yy+74, '릴레이', {size:11, anchor:'middle', fill:'#fff', weight:700});
  s += T(gx+420, yy+110, '캡이 릴레이 바로 옆 = 출렁임을 가까이서 흡수', {size:11.5, anchor:'middle', fill:C.ok});
  s += T(gx+18, yy+140, '✓ 전선 짧음 · ✓ GND 공통 · ✓ 극성 맞음', {size:11.5, fill:C.ok, weight:600});

  // 나쁜 예
  const ax=yx+gw+20, aw=yw-gw-20;
  s += `<rect x="${ax}" y="${yy}" width="${aw}" height="${yh}" rx="10" fill="#fff5f4" stroke="${C.warn}"/>`;
  s += T(ax+18, yy+28, '❌ 나쁜 예 — ESP32 옆에 달았음', {size:13.5, weight:700, fill:C.warn});
  s += `<rect x="${ax+18}" y="${yy+50}" width="60" height="32" rx="4" fill="#1e293b"/>`;
  s += T(ax+48, yy+71, 'ESP32', {size:10.5, anchor:'middle', fill:'#fff', weight:700});
  // 캡이 ESP32 바로 옆
  s += `<rect x="${ax+90}" y="${yy+48}" width="14" height="36" fill="#1f1f1f"/>`;
  s += `<line x1="${ax+84}" y1="${yy+58}" x2="${ax+84}" y2="${yy+78}" stroke="#000" stroke-width="3"/>`;
  s += `<line x1="${ax+90}" y1="${yy+58}" x2="${ax+90}" y2="${yy+78}" stroke="#000" stroke-width="3"/>`;
  s += `<line x1="${ax+78}" y1="${yy+58}" x2="${ax+480}" y2="${yy+58}" stroke="${VCC}" stroke-width="3"/>`;
  s += `<line x1="${ax+78}" y1="${yy+78}" x2="${ax+480}" y2="${yy+78}" stroke="${BLUE}" stroke-width="3"/>`;
  s += `<rect x="${ax+480}" y="${yy+44}" width="100" height="50" rx="4" fill="#0b6b41"/>`;
  s += T(ax+530, yy+74, '릴레이', {size:11, anchor:'middle', fill:'#fff', weight:700});
  s += T(ax+aw/2, yy+110, '전선이 길어 출렁임을 못 잡음 → ESP32 리셋·BLE 끊김', {size:11.5, anchor:'middle', fill:C.warn});
  s += T(ax+18, yy+140, '✗ 거리 멀음 · ✗ 효과 거의 없음', {size:11.5, fill:C.warn, weight:600});

  // 하단 한 줄 결론
  s += T(W/2, H-30, '핵심: 릴레이 VCC↔GND 사이에 10µF + 0.1µF 병렬로 · 다리 짧게 · 전해 띠(−)를 GND로 · ESP32와 릴레이 GND는 같은 줄', {size:13, anchor:'middle', weight:600, fill:'#0f4c81'});

  return svgDoc(W,H,s);
}

// ================= UP200 순환펌프 (220V, 릴레이 직렬) =================
function buildUP200() {
  const W=1240, H=760;
  const L='#b0291f', N='#0e7490';   // 활선(빨강) / 중성선(청록)
  let s='';
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
  s += T(40,42,'순환펌프 배선도 — 협신 UP200 (단상 220V · 20W) · 릴레이 직렬 제어', {size:22, weight:700});
  s += T(40,68,'펌프 전원코드의 활선(L)을 잘라 릴레이 접점(COM–NO) 사이에 직렬 삽입 · 중성선(N)은 자르지 않고 그대로 · 타이머 ON/OFF', {size:13.5, fill:C.mute});

  // ===== 밴드1: 제어부 (ESP32 + 릴레이) y 110~290 =====
  const ex=40, ey=110, ew=160, eh=180;
  s += `<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" rx="12" fill="${C.pale}" stroke="#94a3b8" stroke-width="1.6"/>`;
  s += T(ex+ew/2, ey+30, 'ESP32', {size:16, anchor:'middle', weight:700});
  s += T(ex+ew/2, ey+50, '(보드)', {size:11.5, anchor:'middle', fill:C.mute});
  const ep=[['5V',C.v5,160],['GND',C.gnd,200],['IO26',C.sig,240]];
  ep.forEach(p=>{ s+= T(ex+ew-16, p[2]+4, p[0], {anchor:'end', size:13}) + dot(ex+ew, p[2], p[1], 5); });

  const rx=300, ry=110, rw=240, rh=180;
  s += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="12" fill="${C.box}" stroke="${C.boxStroke}" stroke-width="1.6"/>`;
  s += T(rx+rw/2, ry+28, '릴레이 모듈 CH2 (순환)', {size:15, anchor:'middle', weight:700});
  s += T(rx+rw/2, ry+47, 'LOW = ON · 250VAC 정격', {size:11.5, anchor:'middle', fill:C.warn, weight:600});
  const rp=[['VCC',C.v5,160],['GND',C.gnd,200],['IN',C.sig,240]];
  rp.forEach(p=>{ s+= dot(rx, p[2], p[1], 5) + T(rx+14, p[2]+4, p[0], {size:13}); });
  // 제어 배선
  s += wire([[ex+ew,160],[rx,160]], C.v5);
  s += wire([[ex+ew,200],[rx,200]], C.gnd);
  s += wire([[ex+ew,240],[rx,240]], C.sig);
  // 디커플링
  s += capV(rx-42, 160, '10µF', true) + wire([[rx-42,160],[rx,160]], C.v5,1.4) + wire([[rx-42,190],[rx-42,200],[rx,200]], C.gnd,1.6);
  // 접점(하단) COM / NO  — 라벨은 박스 안쪽 위에, 배선은 아래로
  const comX=rx+64, noX=rx+rw-64, contY=ry+rh;   // contY=290
  s += T(comX, contY-12, 'COM', {size:12, anchor:'middle', weight:600, fill:L});
  s += T(noX, contY-12, 'NO', {size:12, anchor:'middle', weight:600, fill:L});
  s += dot(comX, contY, L, 5) + dot(noX, contY, L, 5);

  // 타이머 안내(밴드1 우측)
  s += `<rect x="600" y="110" width="600" height="150" rx="10" fill="#eef7f0" stroke="#79b894"/>`;
  s += T(620, 138, '순환 타이머 (코드: UP200_pump.ino)', {size:13.5, weight:700, fill:C.ok});
  s += T(620, 162, '· 기본 주기: ON 5분 → OFF 25분 무한 반복', {size:12.5});
  s += T(620, 184, '· 시리얼(115200): on=10 / off=20 으로 분 단위 변경', {size:12.5});
  s += T(620, 206, '· 1=강제ON · 0=강제OFF · a=자동 · t=극성반전 · s=상태', {size:12.5});
  s += T(620, 230, '· 릴레이 ON = 접점(COM–NO) 붙음 = 펌프 ON', {size:12.5, fill:C.mute});
  s += T(620, 250, '· 릴레이는 활선 L 만 끊음(N은 항상 통전)', {size:12.5, fill:C.warn});

  // ===== 밴드2: AC 배선 (콘센트 → 릴레이 직렬 → 펌프) y 380~560 =====
  const cx=40, cy=380, cw=170, ch=120;
  s += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="10" fill="#fff5f4" stroke="${C.warn}" stroke-width="1.5"/>`;
  s += T(cx+cw/2, cy+30, '⚠ 220V 콘센트', {size:14, anchor:'middle', weight:700, fill:C.warn});
  s += T(cx+cw/2, cy+50, '(돼지코)', {size:11, anchor:'middle', fill:C.mute});
  const Lc=cy+78, Nc=cy+104;     // 458, 484
  s += dot(cx+cw, Lc, L, 5) + T(cx+cw-12, Lc+4, 'L', {size:12, anchor:'end', weight:700, fill:L});
  s += dot(cx+cw, Nc, N, 5) + T(cx+cw-12, Nc+4, 'N', {size:12, anchor:'end', weight:700, fill:N});

  const px=980, py=380, pw=215, ph=150;
  s += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="#fff" stroke="${C.accent}" stroke-width="1.8"/>`;
  s += T(px+pw/2, py+34, '협신 UP200', {size:16, anchor:'middle', weight:700, fill:C.accent});
  s += T(px+pw/2, py+56, '단상 220V · 20W', {size:12.5, anchor:'middle', fill:C.mute});
  s += T(px+pw/2, py+76, '수중모터 (순환)', {size:12, anchor:'middle', fill:C.mute});
  s += dot(px, py+98, L, 5) + T(px+14, py+102, 'L', {size:12, weight:700, fill:L});
  s += dot(px, py+124, N, 5) + T(px+14, py+128, 'N', {size:12, weight:700, fill:N});

  // 활선 L: 콘센트 L → (절단) → 위로 COM ;  NO → 오른쪽 → 펌프 L
  s += wire([[cx+cw, Lc],[comX, Lc],[comX, contY]], L, 3);   // 콘센트L → COM(아래에서 위로)
  s += wire([[noX, contY],[noX, py+98],[px, py+98]], L, 3);  // NO → 펌프 L (y=478)
  // 절단 표시
  const ctX=cx+cw+60, ctY=Lc;
  s += `<line x1="${ctX-12}" y1="${ctY-12}" x2="${ctX+12}" y2="${ctY+12}" stroke="${C.warn}" stroke-width="2.8"/>`;
  s += `<line x1="${ctX-12}" y1="${ctY+12}" x2="${ctX+12}" y2="${ctY-12}" stroke="${C.warn}" stroke-width="2.8"/>`;
  s += T(ctX, ctY-18, '여기서 절단', {size:11, anchor:'middle', fill:C.warn, weight:600});
  s += T(comX+150, Lc-10, '활선 L = 잘라서 릴레이 접점에 직렬', {size:11.5, anchor:'middle', fill:L, weight:600});
  // 중성선 N: 콘센트 N → 펌프 N (직선, 안 자름)
  s += wire([[cx+cw, Nc],[px, py+124]], N, 3);
  s += T((cx+cw+px)/2, py+124+18, '중성선 N — 자르지 않고 그대로 (OFF 때도 통전)', {size:11.5, anchor:'middle', fill:N});

  // ===== 밴드3: 범례 + 안전 y 600~ =====
  const ly=606;
  s += `<line x1="40" y1="${ly}" x2="72" y2="${ly}" stroke="${L}" stroke-width="4"/>`+T(78,ly+4,'활선 L (220V)');
  s += `<line x1="210" y1="${ly}" x2="242" y2="${ly}" stroke="${N}" stroke-width="4"/>`+T(248,ly+4,'중성선 N');
  s += `<line x1="360" y1="${ly}" x2="392" y2="${ly}" stroke="${C.v5}" stroke-width="4"/>`+T(398,ly+4,'5V');
  s += `<line x1="450" y1="${ly}" x2="482" y2="${ly}" stroke="${C.gnd}" stroke-width="4"/>`+T(488,ly+4,'GND');
  s += `<line x1="560" y1="${ly}" x2="592" y2="${ly}" stroke="${C.sig}" stroke-width="4"/>`+T(598,ly+4,'신호 IO26');
  s += `<line x1="700" y1="${ly-11}" x2="722" y2="${ly+11}" stroke="${C.warn}" stroke-width="2.6"/><line x1="700" y1="${ly+11}" x2="722" y2="${ly-11}" stroke="${C.warn}" stroke-width="2.6"/>`+T(730,ly+4,'코드 절단 지점', {fill:C.warn});

  s += `<rect x="40" y="640" width="1160" height="100" rx="10" fill="#fff8e6" stroke="#e0b94a"/>`;
  s += T(58,668,'안전 (220V)', {size:13, weight:700, fill:'#8a6d1a'});
  s += T(58,692,'· 반드시 콘센트(돼지코) 뽑은 상태에서 코드 절단·결선. 절단부는 열수축/절연테이프로 절연 필수.', {size:12, fill:C.warn});
  s += T(58,712,'· 릴레이는 활선 L 만 끊음 → OFF여도 N은 통전. 펌프 손댈 땐 콘센트째 분리.', {size:12});
  s += T(58,732,'· 릴레이 접점 250VAC 이상 정격 확인(UP200은 20W라 여유 충분). 누전차단 콘센트 권장.', {size:12});

  return svgDoc(W,H,s);
}

function svgDoc(W,H,body){
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" ${FONT}>\n${body}\n</svg>\n`;
}
function wrap(svg){
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style></head><body>${svg}</body></html>`;
}

const aS = buildA(), bS = buildB(), upS = buildUP200(), dcS = buildDecoupling(), pdS = buildPumpDiode(), afS = buildAFritzing();
fs.writeFileSync(path.join(OUT,'A_board_wiring_v3.svg'), aS);
fs.writeFileSync(path.join(OUT,'B_board_wiring_v3.svg'), bS);
fs.writeFileSync(path.join(OUT,'UP200_circulation_wiring.svg'), upS);
fs.writeFileSync(path.join(OUT,'decoupling_cap_howto.svg'), dcS);
fs.writeFileSync(path.join(OUT,'pump_diode_howto.svg'), pdS);
fs.writeFileSync(path.join(OUT,'A_board_fritzing.svg'), afS);
const bfS = buildBFritzing();
fs.writeFileSync(path.join(OUT,'B_board_fritzing.svg'), bfS);
fs.writeFileSync(path.join(GEN,'BF_wrap.html'), wrap(bfS));
fs.writeFileSync(path.join(GEN,'A_wrap.html'), wrap(aS));
fs.writeFileSync(path.join(GEN,'B_wrap.html'), wrap(bS));
fs.writeFileSync(path.join(GEN,'UP_wrap.html'), wrap(upS));
fs.writeFileSync(path.join(GEN,'DC_wrap.html'), wrap(dcS));
fs.writeFileSync(path.join(GEN,'PD_wrap.html'), wrap(pdS));
fs.writeFileSync(path.join(GEN,'AF_wrap.html'), wrap(afS));
const dim = svg => { const m=svg.match(/width="(\d+)" height="(\d+)"/); return `${m[1]}x${m[2]}`; };
console.log('A '+dim(aS));
console.log('B '+dim(bS));
console.log('UP '+dim(upS));
console.log('DC '+dim(dcS));
console.log('PD '+dim(pdS));
console.log('done');
