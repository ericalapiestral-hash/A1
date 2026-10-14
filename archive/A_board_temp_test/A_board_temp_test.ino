// ===================================================================
//  A보드 수온센서(DS18B20) 단독 테스트 스케치
//  -----------------------------------------------------------------
//  목적: 본 펌웨어(A_board.ino) 올리기 전에 DS18B20 배선·동작만 따로 검증.
//        ESP-NOW / LCD / 다른 센서 전부 빼고 "오직 수온"만 측정·표시.
//  -----------------------------------------------------------------
//  배선 (본 A보드와 동일):
//    DS18B20 VCC(빨강) -> 3.3V
//    DS18B20 GND(검정) -> GND
//    DS18B20 DATA(노랑) -> IO4
//    4.7k 풀업저항     -> DATA <-> 3.3V (필수, 없으면 -127 C)
//
//  필요 라이브러리: OneWire / DallasTemperature  (둘 다 Library Manager)
//  -----------------------------------------------------------------
//  ※ 시리얼 출력 메시지는 한글 깨짐 방지를 위해 전부 ASCII(영문)로 둠.
//    Arduino IDE 시리얼 모니터의 인코딩 설정과 무관하게 항상 잘 보임.
//
//  시리얼 명령(115200):
//    r  : rescan bus (센서 재검색)
//    a  : print ROM address (주소 출력)
//    s  : sample now (즉시 1회 측정)
//    +  : interval +500ms (주기 늘림)
//    -  : interval -500ms (최소 500ms)
//    h  : help (도움말)
// ===================================================================

#include <OneWire.h>
#include <DallasTemperature.h>

#define PIN_DS18B20   4          // DATA 핀 (본 펌웨어와 동일)

OneWire oneWire(PIN_DS18B20);
DallasTemperature ds(&oneWire);

unsigned long intervalMs = 1000; // 측정 주기(기본 1초)
unsigned long lastRead   = 0;

int    deviceCount = 0;
float  lastValidT  = NAN;        // 마지막 정상값
int    okCount     = 0;
int    failCount   = 0;

void printHelp() {
  Serial.println();
  Serial.println("============================================");
  Serial.println("  DS18B20 standalone test (A board, IO4)");
  Serial.println("============================================");
  Serial.printf(" pin IO%d  | interval %lu ms\n", PIN_DS18B20, intervalMs);
  Serial.println(" cmd: r=rescan  a=address  s=sample  +/-=interval  h=help");
  Serial.println("--------------------------------------------");
}

void scanBus() {
  ds.begin();

  // 가장 밑바닥 검사: 1-Wire reset 후 presence pulse 가 오는가?
  //   present=1 -> 버스에 "살아있는 칩"이 1개 이상 있음 (배선 OK, 칩 OK)
  //   present=0 -> 아무도 응답 안 함 (칩 죽음/짝퉁  또는  DATA/전원 미연결)
  bool present = oneWire.reset();
  Serial.printf("[BUS ] presence pulse: %s\n",
                present ? "YES (살아있는 칩 감지!)" : "NO  (응답 칩 없음)");

  deviceCount = ds.getDeviceCount();
  Serial.printf("[SCAN] DS18B20 found: %d\n", deviceCount);
  if (deviceCount == 0) {
    Serial.println("  X sensor not found. Check:");
    Serial.println("    1) DATA wire on IO4 ?");
    Serial.println("    2) 4.7k pull-up between DATA and 3.3V ?");
    Serial.println("    3) VCC=3.3V / GND=GND ?");
    Serial.println("    4) genuine sensor (fake/dead -> not detected)");
  } else {
    Serial.println("  OK. start measuring.");
  }
}

void printAddresses() {
  if (deviceCount == 0) { Serial.println("[ADDR] no device"); return; }
  DeviceAddress addr;
  for (int i = 0; i < deviceCount; i++) {
    if (ds.getAddress(addr, i)) {
      Serial.printf("[ADDR] #%d ROM = ", i);
      for (int j = 0; j < 8; j++) Serial.printf("%02X ", addr[j]);
      Serial.println();
    }
  }
}

void readOnce() {
  if (deviceCount == 0) {
    Serial.println("[READ] no device (press 'r' to rescan)");
    failCount++;
    return;
  }

  ds.requestTemperatures();
  float t = ds.getTempCByIndex(0);

  // DS18B20 오류 패턴:
  //   -127.00 : 미연결 / 풀업 없음 / 전원 문제
  //    85.00  : 변환 미완 / 전원 순간 불안
  //   범위 밖  : 노이즈
  bool ok = (t > -50.0 && t < 85.0 && fabs(t - 85.0) > 0.01);

  if (ok) {
    lastValidT = t; okCount++;
    Serial.printf("[READ] %.2f C   (ok:%d  fail:%d)\n", t, okCount, failCount);
  } else {
    failCount++;
    const char* why = "";
    if (t <= -100)              why = "(no connect / no pull-up?)";
    else if (fabs(t-85.0)<0.01) why = "(conversion not ready / power glitch)";
    else if (t < -50)           why = "(noise / out of range)";
    else                        why = "(abnormal)";
    Serial.printf("[READ] %.2f C  %s   (ok:%d  fail:%d)\n", t, why, okCount, failCount);
  }
}

void handleSerial() {
  if (!Serial.available()) return;
  char c = Serial.read();
  if (c == '\n' || c == '\r') return;

  switch (c) {
    case 'r': case 'R': scanBus(); break;
    case 'a': case 'A': printAddresses(); break;
    case 's': case 'S': readOnce(); break;
    case '+':
      intervalMs += 500;
      Serial.printf("[SET] interval %lu ms\n", intervalMs);
      break;
    case '-':
      if (intervalMs > 500) intervalMs -= 500;
      Serial.printf("[SET] interval %lu ms\n", intervalMs);
      break;
    case 'h': case 'H': case '?': printHelp(); break;
    default:
      Serial.printf("[?] '%c' - press h for help\n", c);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  printHelp();
  scanBus();
  printAddresses();
  readOnce();   // 첫 측정
}

void loop() {
  handleSerial();
  if (millis() - lastRead >= intervalMs) {
    lastRead = millis();
    readOnce();
  }
}
