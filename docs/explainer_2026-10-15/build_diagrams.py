"""Code-based engineering illustrations; no photograph or measured wiring is implied."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'images'
OUT.mkdir(exist_ok=True)
W, H = 2560, 1440
INK, MUTED, TEAL, BLUE, ORANGE, RED = '#153747', '#526979', '#007F80', '#2369B1', '#AC6412', '#BC3845'
BG, LINE = '#F4F7FA', '#CFDAE3'
REG = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
FILES = []

def font(size=30, bold=False):
    return ImageFont.truetype(BOLD if bold else REG, size, index=1)

def txt(x, y, value, size=30, color=INK, bold=False, max_width=None):
    f=font(size,bold)
    for line in value.split('\n'):
        if max_width is not None:
            assert draw.textlength(line,font=f)<=max_width, (value,max_width)
        draw.text((x,y),line,font=f,fill=color)
        y+=round(size*1.5)
    return y

def box(x,y,w,h,title,body='',accent=TEAL,fill='white',size=30):
    draw.rounded_rectangle((x,y,x+w,y+h),radius=20,fill=fill,outline=LINE,width=2)
    draw.rounded_rectangle((x,y,x+8,y+h),radius=4,fill=accent)
    txt(x+26,y+18,title,34,accent,True,w-48)
    if body:txt(x+26,y+78,body,size,INK,False,w-48)

def line(points,color=TEAL,width=5,dashed=False):
    if not dashed:draw.line(points,fill=color,width=width,joint='curve');return
    for (x1,y1),(x2,y2) in zip(points,points[1:]):
        length=math.hypot(x2-x1,y2-y1)
        if not length:continue
        for step in range(0,int(length),26):
            a=step/length;b=min(step+14,length)/length
            draw.line((x1+(x2-x1)*a,y1+(y2-y1)*a,x1+(x2-x1)*b,y1+(y2-y1)*b),fill=color,width=width)

def arrow(points,color=TEAL,dashed=False):
    line(points,color,5,dashed)
    x,y=points[-1];px,py=points[-2];a=math.atan2(y-py,x-px)
    draw.polygon([(x,y),(x-20*math.cos(a-.45),y-20*math.sin(a-.45)),(x-20*math.cos(a+.45),y-20*math.sin(a+.45))],fill=color)

def dot(x,y,color=TEAL):draw.ellipse((x-7,y-7,x+7,y+7),fill=color)

def begin(no,title,subtitle):
    global im,draw
    im=Image.new('RGB',(W,H),BG);draw=ImageDraw.Draw(im)
    draw.rectangle((0,0,W,14),fill=TEAL)
    txt(70,42,f'{no:02d}  {title}',57,INK,True,2420)
    txt(72,126,subtitle,29,MUTED,False,2415)
    draw.line((70,195,2490,195),fill=LINE,width=2)

def finish(name,notice):
    draw.rectangle((70,1282,2490,1380),fill='#E9EFF4')
    txt(92,1296,notice,25,MUTED,False,2370)
    txt(74,1395,'AquaControl | 코드 기준 설명도 · 실물 사진 아님 | 2026-10-15 | 앱 1.3.8 / B 1.1.0',20,MUTED)
    p=OUT/name;im.save(p,dpi=(300,300));FILES.append(p)

# 01 — System, with wireless and electrical connections intentionally distinct.
begin(1,'전체 구성 · 센서 정보와 제어 명령의 이동','A는 측정 담당, B는 통신과 펌프 제어 담당입니다. 보드 사이 센서 통신은 ESP-NOW 무선입니다.')
box(80,260,480,260,'수조 센서','pH · 탁도 전압 · 수위\n실제 로그/수신값에서 확인\n수온 센서는 제거',BLUE)
box(80,660,480,230,'스마트폰 앱','급수: 끄기 / 켜기\n순환: 끄기 / 켜기 / 자동',BLUE)
box(770,260,480,260,'ESP32 A보드','센서값 측정 후 송신\n실기 원본 소스는 없음\n센서 GPIO는 확인 필요',ORANGE)
box(1470,430,470,360,'ESP32 B보드','Aquarium-pumps-1.1.0\n센서 수신 · 명령 처리\n급수 GPIO16 / 순환 GPIO17\nLCD 표시 · 상태 회신',TEAL)
box(2120,260,350,180,'펌프 제어','릴레이 → 펌프\n실제 회전은 별도 확인',TEAL,size=27)
box(2120,650,350,180,'16×2 LCD','센서·펌프·연결 표시\n6개 신호선 연결',TEAL,size=27)
arrow([(560,390),(770,390)],BLUE);txt(578,316,'센서 신호',27,BLUE)
arrow([(1250,390),(1360,390),(1360,500),(1470,500)],BLUE,True);txt(1255,265,'ESP-NOW',27,BLUE);txt(1255,305,'12바이트',25,BLUE)
arrow([(560,760),(1470,760)],TEAL,True);txt(850,704,'BLE · 명령 보내기',30,TEAL)
arrow([(1705,790),(1705,920),(1330,920),(1330,945),(320,945),(320,890)],BLUE,True);txt(790,953,'BLE · 센서/출력 상태 받기',30,BLUE)
arrow([(1940,500),(2035,500),(2035,350),(2120,350)],TEAL)
arrow([(1940,700),(2120,740)],TEAL)
box(80,1060,1170,150,'역할을 나눈 이유','측정과 펌프 제어를 나누고, B가 앱과 센서 사이에서 정보를 전달합니다.',size=29)
box(1330,1060,1140,150,'확인 범위','순환 1.0.1 실기 정상 확인 / 급수 1.1.0 배포 완료·실기 확인 대기',ORANGE,size=28)
finish('01_system_overview.png','실선: 전기 신호/연결 관계   점선: 무선 통신   주황: 실물 확인 필요\nA와 B 사이에 ESP-NOW 통신용 신호선이나 GND선을 새로 연결할 필요는 없습니다.')

# 02 — Current sensor paths: pins and model numbers are NOT asserted.
begin(2,'센서 연결 · 현재 확인된 것과 아직 모르는 것','현재 Aquarium 경로에서 확인된 정보는 pH, 탁도 전압(V), 수위 부족 여부입니다.')
rows=[(280,'pH 센서','물의 산성·알칼리성','전극 → pH 변환 모듈','ph: pH 숫자 전달'),(550,'탁도 센서','물의 흐림에 따른 신호','광학 센서 → 변환 모듈','turb: 전압 V 값 전달'),(820,'수위 센서','센서 위치의 물 감지','물 감지 센서/출력 모듈','water_low=1 → 부족')]
for y,title,role,module,out in rows:
    box(90,y,490,200,title,role,BLUE,size=29)
    box(760,y,640,200,module,'정격 전원 · GND · OUT 확인\n모델과 출력 방식은 실물 확인',ORANGE,size=29)
    arrow([(580,y+100),(760,y+100)],BLUE)
    arrow([(1400,y+100),(1620,y+100)],BLUE);txt(1425,y+27,'OUT 신호',27,BLUE)
    txt(1660,y+35,out,31,BLUE,True)
    txt(1660,y+95,'A보드 입력 GPIO: 확인 필요',29,ORANGE)
draw.rounded_rectangle((1600,245,2470,1060),radius=22,outline=BLUE,width=3)
txt(1640,1085,'A → B: 센서 묶음 12바이트',32,TEAL,True)
box(90,1100,1350,130,'현재 자료에서 단정하지 않는 항목','조도 센서 실사용 여부 · 센서 정확한 모델 · A보드 입력 핀 · 전원 정격',ORANGE,size=27)
finish('02_current_sensors.png','각 센서 모듈과 A보드는 호환되는 신호 전압과 기준 GND가 필요합니다. 실제 정격은 센서 제품으로 확인합니다.\n저장소 A_board.ino의 GPIO32/34/35를 현재 실기 A의 핀으로 단정하거나 그대로 재배선하지 마세요.')

# 03 — Logical port mapping; not a physical ESP32 header location diagram.
begin(3,'B보드 상세 연결표 · 현재 Aquarium 기준','GPIO 번호로 연결 관계를 그린 그림입니다. 보드 헤더의 실제 위치·핀 순서를 나타내지는 않습니다.')
box(100,245,500,930,'ESP32 B보드','B_board_Aquarium\nB 펌웨어 v1.1.0',TEAL)
items=[('GPIO16','급수 릴레이의 IN','수동 OFF/ON · 극성 선택 필요',ORANGE),('GPIO17','순환 릴레이의 IN','현재 확인: LOW 정지 / HIGH 작동',TEAL),('GPIO18','히터용 기존 출력','기존 HIGH 유지 · 히터 전원 분리',MUTED),('GPIO13 / GPIO14','LCD RS / E','화면 제어 신호',BLUE),('GPIO27 / GPIO26','LCD D4 / D5','화면 데이터 신호',BLUE),('GPIO25 / GPIO33','LCD D6 / D7','화면 데이터 신호',BLUE)]
for i,(pin,target,desc,c) in enumerate(items):
    y=430+i*116
    txt(145,y,pin,33,c,True)
    arrow([(600,y+26),(980,y+26)],c)
    txt(1040,y-9,target,34,c,True)
    txt(1040,y+41,desc,28,MUTED)
box(1980,250,490,410,'릴레이 제어측','IN: B의 제어 신호\nVCC: 모듈 정격 전원\nGND: 제어측 기준\n\n3.3V 신호 호환 확인',ORANGE,size=28)
box(1980,710,490,460,'혼동하기 쉬운 점','GPIO25/26/27은\n현재 B에서 LCD에 사용\n\n예전 B_board.ino의\n펌프 25/26·히터 27\n배선과 다릅니다.',RED,size=28)
finish('03_b_board_connections.png','급수 GPIO16은 원본 B 분석과 새 코드 기준이며 실제 IN 선 연결은 현장 확인이 필요합니다.\n일반 비절연 릴레이 모듈은 B와 제어측 GND를 공유합니다. 절연형 모듈의 전원/접지는 해당 회로를 따릅니다.')

# 04 — Actual six GPIO signals and typical LCD power terminals.
begin(4,'B보드 LCD 배선 · 16×2 병렬 4비트 방식','코드: LiquidCrystal lcd(13, 14, 27, 26, 25, 33) — 앞 2개는 제어, 뒤 4개는 데이터입니다.')
box(90,250,550,890,'B보드 신호 핀','3.3V 논리 신호',BLUE)
box(1550,250,900,890,'일반 HD44780형 LCD','단자 번호는 일반 16핀 LCD 기준 · 실물 표기 확인',TEAL,size=28)
pins=[('GPIO13','4번 RS','글자/명령 구분'),('GPIO14','6번 E','데이터 읽는 시점'),('GPIO27','11번 D4','데이터'),('GPIO26','12번 D5','데이터'),('GPIO25','13번 D6','데이터'),('GPIO33','14번 D7','데이터')]
for i,(gpio,target,role) in enumerate(pins):
    y=430+i*106
    txt(140,y,gpio,35,BLUE,True)
    arrow([(640,y+27),(1550,y+27)],BLUE)
    txt(1600,y,target,34,TEAL,True);txt(1950,y+5,role,29,MUTED)
box(740,250,690,155,'4비트 모드인 이유','D4~D7 네 선을 두 번 사용해 전달\n핀 수를 줄이면서 글자를 표시',TEAL,size=25)
txt(100,1167,'B의 표시: 순환 → pH/탁도 → 수위 → 급수 → 타이머/BLE (약 3초씩)',30,TEAL,True,2320)
finish('04_lcd_wiring.png','전원 참고: 1 VSS→GND / 2 VDD→제품 정격 / 3 V0→대비 조정 / 5 RW→GND / 7~10 D0~D3 미사용.\n백라이트 15 A·16 K와 저항은 제품 사양 확인. LCD 공급 전압과 3.3V 신호 호환성은 별개입니다.')

# 05 — Relay contact concept, distinct from the unverified physical NC/NO wiring.
begin(5,'릴레이와 펌프 · 작은 신호로 별도 전원을 제어','왼쪽은 제어 신호, 오른쪽은 펌프 전력 회로입니다. 아래는 DC 펌프의 NO 접점 사용 원리 예시입니다.')
box(80,270,470,330,'ESP32 B보드','급수 GPIO16\n순환 GPIO17\n\nGPIO는 펌프 전원이 아님',BLUE,size=29)
box(800,260,620,370,'릴레이 모듈 제어측','IN → 구동 회로 → 코일\nVCC/GND: 모듈 정격 전원\n\n3.3V 입력 호환성 확인',TEAL,size=30)
arrow([(550,400),(800,400)],BLUE);txt(572,340,'ON/OFF',28,BLUE)
line([(1500,250),(1500,1150)],ORANGE,4,True);txt(1540,270,'접점: 스위치 역할',33,ORANGE,True)
box(1730,375,650,190,'정격 DC 전원','펌프 전압·전류에 맞는 어댑터',ORANGE,size=28)
txt(1810,585,'＋',36,RED,True);txt(2245,585,'－',36,INK,True)
line([(1830,565),(1830,720)],RED)
dot(1830,720,RED);txt(1650,679,'COM',30,RED,True)
dot(1830,865,RED);txt(1668,842,'NO',30,RED,True)
line([(1830,720),(1910,830)],RED)
arrow([(1830,865),(1830,1045)],RED)
box(1700,1045,670,160,'DC 펌프','접점이 닫히면 전원 회로가 이어짐',ORANGE,size=28)
line([(2265,565),(2420,565),(2420,1125),(2370,1125)],INK)
arrow([(1420,480),(1515,480),(1515,790),(1745,790)],ORANGE,True)
txt(930,713,'코일 동작이',29,ORANGE);txt(930,757,'접점을 움직임',29,ORANGE)
box(80,740,710,460,'COM / NO / NC의 뜻','COM: 공통 접점\nNO: 코일이 쉬면 열리는 접점\nNC: 코일이 쉬면 닫히는 접점\n\n실제 사용 접점은 아직 미확인\nHIGH/LOW 트리거와는 다른 개념',TEAL,size=29)
finish('05_relay_and_dc_pump.png','이 그림은 NO 접점을 쓰는 일반 DC 원리 예시이며 현재 실물 접점을 확정한 배선도는 아닙니다.\n펌프 정격·기동 전류에 맞는 DC 접점과 보호회로가 필요합니다. 펌프 전류를 ESP32 GPIO로 흘리지 않습니다.')

# 06 — Power domains; do not provide a misleading mains terminal hookup recipe.
begin(6,'전기 배선의 구분 · 신호 전원과 펌프 전력','펌프 명판과 릴레이 사양은 아직 확인되지 않았습니다. 이 그림은 전원 구역을 나누는 원리도입니다.')
box(80,255,1130,890,'저전압 제어 구역','USB 5V → ESP32 보드 내부 3.3V\n센서·릴레이·LCD 전원은 각 제품 정격 확인',BLUE,size=31)
box(140,500,430,190,'ESP32 한 보드','예: B / GPIO 3.3V 신호',BLUE,size=27)
box(700,500,440,190,'제어 모듈','센서 · LCD · 릴레이 IN',TEAL,size=27)
arrow([(570,590),(700,590)],BLUE)
line([(190,800),(1110,800)],INK,5);txt(200,820,'제어측 기준 GND — 일반 비절연 연결에서 공유',28,INK)
line([(350,690),(350,800)],INK);line([(920,690),(920,800)],INK)
txt(140,940,'센서가 5V로 동작해도 출력 신호가\nESP32 입력에 안전한지는 별도로 확인합니다.',31,RED)
box(1360,255,1110,400,'DC 펌프 전력 구역','펌프 정격 DC 전원 → 정격 접점/보호회로 → DC 펌프\n펌프 전압과 전류는 명판으로 확인\n과거 문서의 12V 급수 모델은 현재 실물 확인 전 참고값',ORANGE,size=29)
box(1360,730,1110,415,'AC 펌프 전력 구역 — 해당 제품일 때','AC 전원 → 보호·절연·정격 접점 → AC 펌프\n접지형 제품은 보호접지(PE)도 제품 규격대로 유지\n과거 문서: UP200 / 220V / 20W — 현재 명판 미확인\n\n220V는 감전 위험이 있으므로 자격 있는 작업자가 시공',RED,size=28)
txt(1360,1190,'AC L/N/PE를 ESP32 GND·GPIO에 연결하지 않습니다.',31,RED,True,1110)
finish('06_power_domains.png','전원선은 신호선과 구분하고, 릴레이 제어측 전원과 접점 부하 정격을 각각 확인합니다.\nDC 건식 접점 회로만으로 펌프 전원 음극을 B의 GND에 연결할 이유는 없습니다. 실제 모듈의 절연 구조를 확인합니다.')

# 07 — Sensor conditioning / voltage units / level semantics, not asserted actual pins.
begin(7,'센서 신호를 숫자로 바꾸는 이유','아래는 원리 설명입니다. 실제 A보드의 회로·저항값·보정식은 원본 소스와 실물 확인이 필요합니다.')
box(80,250,700,250,'① 센서/변환 모듈','물 상태를 전압 또는 0/1 신호로 바꿈\n센서 정격 전원과 출력 범위 확인',BLUE,size=30)
box(940,250,650,250,'② 신호 조정','분압 / 필터 / 필요 시 레벨 변환\nESP32 입력 범위를 넘지 않게',ORANGE,size=29)
box(1750,250,720,250,'③ A보드에서 숫자로 읽음','아날로그: ADC로 전압 읽기\n디지털: 물 감지 신호 읽기',TEAL,size=30)
arrow([(780,380),(940,380)],BLUE);arrow([(1590,380),(1750,380)],BLUE)
box(80,620,1150,540,'전압 분배의 원리',accent=ORANGE)
txt(150,713,'센서 OUT',27,BLUE);txt(360,713,'R1',27,ORANGE);txt(925,713,'ADC 입력',27,TEAL)
line([(165,780),(340,780)],BLUE);draw.rectangle((340,760,450,800),outline=ORANGE,width=4)
line([(450,780),(650,780)],BLUE);dot(650,780,BLUE);arrow([(650,780),(1100,780)],BLUE)
line([(650,780),(650,820)],INK);draw.rectangle((630,820,670,885),outline=ORANGE,width=4)
txt(690,830,'R2',27,ORANGE);line([(650,885),(650,918)],INK)
line([(612,918),(688,918)],INK);line([(622,932),(678,932)],INK);txt(730,893,'GND',26,INK)
txt(135,966,'ADC 전압 = OUT 전압 × R2 / (R1 + R2)\n저장소 예: 10kΩ / 20kΩ이면 5V → 약 3.33V\n오차·최대 전압 여유 확인 필수 — 안전하다고 단정할 수 없음\n회로를 바꾸면 코드의 전압 복원 배율도 맞춰야 함',26,INK,max_width=1030)
box(1360,620,1110,540,'숫자의 의미를 정확하게 설명하기','pH: 보정이 필요한 산성·알칼리성 수치\n탁도: 현재 Aquarium은 전압 V 값 전달 (NTU 아님)\n수위: water_low=1 → 부족 → 앱 level=0\n수위: water_low=0 → 정상 → 앱 level=1\n\n센서값 수신 ≠ 실제 측정 정확도 검증\n수위 한 지점 감지 ≠ 수조 전체 물 높이 측정',TEAL,size=29)
finish('07_sensor_signal_principles.png','저장소 A 코드의 16회 평균은 흔들림을 줄이고, pH 보정식은 전압을 pH 값으로 바꿉니다. 현재 실기 A에 같은 코드가 들어갔는지는 미확인입니다.\n전압 V를 보정 없이 NTU로, 상대 밝기 %를 lux로 설명하지 않습니다. 정격 3.3V 입력에 5V 신호를 직접 넣지 않습니다.')

# 08 — Complete command feedback and mode timing, avoiding optimistic physical claims.
begin(8,'코드 동작 · 명령을 보내고 적용 상태를 확인','앱 버튼 → BLE 명령 → B의 명령 해석 → 출력 설정 → 상태 JSON 회신 순서로 동작합니다.')
steps=[('앱 버튼','급수 켜기 선택'),('BLE 전송','pump1Mode=1'),('B 명령 처리','문자·지원값 검사'),('출력 설정','GPIO16 → 릴레이'),('상태 회신','pump1Mode\npump1On')]
for i,(title,body) in enumerate(steps):
    x=70+i*500;box(x,260,420,190,title,body,TEAL,size=27)
    if i<4:arrow([(x+420,355),(x+500,355)],TEAL)
box(80,560,1120,330,'급수: 수동 상태만 존재','끄기(0) ← 사용자가 선택 → 켜기(1)\n자동(2)은 받지 않음 · 수위/타이머로 작동하지 않음\n켜기는 앱에서 끌 때까지 유지\nB 재부팅 시 기본 끄기',BLUE,size=30)
box(1340,560,1130,330,'순환: 수동과 자동을 분리','끄기(0) / 켜기(1) / 자동(2)\n수동 상태에서는 타이머가 출력을 바꾸지 않음\n자동 선택 시: 작동 120초 → 휴식 60초 반복\n앱에서 작동·휴식 시간을 분 단위로 변경',TEAL,size=30)
txt(90,955,'자동 순환 기본값 예시',30,TEAL,True)
draw.rectangle((90,1030,850,1110),fill=TEAL);draw.rectangle((850,1030,1230,1110),fill='#CCD8E2');draw.rectangle((1230,1030,1990,1110),fill=TEAL);draw.rectangle((1990,1030,2370,1110),fill='#CCD8E2')
txt(350,1040,'작동 120초',32,'white',True);txt(925,1040,'휴식 60초',30,INK,True);txt(1480,1040,'작동 120초',32,'white',True)
for x,label in [(90,'0초'),(850,'120초'),(1230,'180초'),(1990,'300초'),(2370,'360초')]:txt(x-16,1135,label,26,MUTED)
finish('08_control_and_timing.png','BLE 수신 성공만으로 적용됐다고 표시하지 않습니다. 요청과 같은 모드가 회신돼야 앱에서 설정 확인으로 표시합니다.\n보드 ON은 계산된 출력 상태이며 실제 펌프 회전 측정값은 아닙니다. 급수는 연결 끊김이나 수위 변화로 자동 정지하지 않습니다.')

# Compact visual index, preserving full-size standalone PNG files.
index=Image.new('RGB',(1600,1980),'white');di=ImageDraw.Draw(index)
di.text((45,22),'AquaControl 배선·동작 설명도 8종',font=font(40,True),fill=INK)
for i,p in enumerate(FILES):
    thumb=Image.open(p);thumb.thumbnail((745,420))
    x=40+(i%2)*785;y=100+(i//2)*460
    index.paste(thumb,(x,y));di.text((x,y+420),p.name,font=font(21),fill=MUTED)
index.save(ROOT/'00_diagram_index.png',dpi=(150,150))
print(f'Generated {len(FILES)} PNG diagrams, {W}x{H}, and visual index.')
