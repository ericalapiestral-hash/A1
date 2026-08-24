// ===================================================================
//  B보드 작동 테스트 (BLE/ESP-NOW 없음, 순수 릴레이 제어 검증)
//  ─ IO25(펌프1·CH1) → IO26(펌프2·CH2) → IO27(히터·CH3) 순서로
//    3초 ON / 1초 OFF 무한 반복
//  ─ 시리얼(115200)로 한 줄씩 상태/핀 레벨 표시
//  ─ 시리얼 명령:
//      1 → 펌프1만 5초 ON
//      2 → 펌프2만 5초 ON
//      3 → 히터만 5초 ON
//      o → 전부 동시 10초 ON
//      a → 자동 순환 모드(기본)
//      t → 릴레이 극성 반전(LOW↔HIGH 트리거 토글)
//      x → 전부 OFF
// ===================================================================

#define PIN_PUMP1  25   // 급수 (릴레이 CH1)
#define PIN_PUMP2  26   // 순환 (릴레이 CH2)
#define PIN_HEATER 27   // 히터 (릴레이 CH3)

// 릴레이가 반대로 동작하면 시리얼에서 't' 입력 → 자동 반전
bool relayLowTrig = true;

const char* CH_NAME[3] = {"펌프1(CH1)", "펌프2(CH2)", "히터  (CH3)"};
const int   CH_PIN[3]  = {PIN_PUMP1, PIN_PUMP2, PIN_HEATER};

void drive(int pin, bool on) {
  int lvl = (on ^ relayLowTrig) ? HIGH : LOW;
  digitalWrite(pin, lvl);
}

void allOff() {
  for (int i = 0; i < 3; i++) drive(CH_PIN[i], false);
}

void chOnly(int idx, int seconds) {
  allOff();
  Serial.printf(">> %s ON %d초 (pin %d → %s)\n",
                CH_NAME[idx], seconds, CH_PIN[idx],
                (relayLowTrig ? "LOW(=0)" : "HIGH(=1)"));
  drive(CH_PIN[idx], true);
  for (int s = 0; s < seconds; s++) {
    delay(1000);
    Serial.printf("   [%d/%d] pin25:%d pin26:%d pin27:%d\n",
                  s + 1, seconds,
                  digitalRead(PIN_PUMP1), digitalRead(PIN_PUMP2), digitalRead(PIN_HEATER));
  }
  allOff();
  Serial.println("   OFF");
}

enum Mode { AUTO, MANUAL };
Mode mode = AUTO;

void handleSerial() {
  if (!Serial.available()) return;
  char c = Serial.read();
  if (c == '\n' || c == '\r') return;

  switch (c) {
    case '1': mode = MANUAL; chOnly(0, 5); mode = AUTO; break;
    case '2': mode = MANUAL; chOnly(1, 5); mode = AUTO; break;
    case '3': mode = MANUAL; chOnly(2, 5); mode = AUTO; break;
    case 'o': case 'O': {
      mode = MANUAL;
      Serial.println(">> 전부 ON 10초 (3채널 동시)");
      drive(PIN_PUMP1, true); drive(PIN_PUMP2, true); drive(PIN_HEATER, true);
      for (int s = 0; s < 10; s++) {
        delay(1000);
        Serial.printf("   [%d/10] pin25:%d pin26:%d pin27:%d\n", s + 1,
                      digitalRead(PIN_PUMP1), digitalRead(PIN_PUMP2), digitalRead(PIN_HEATER));
      }
      allOff();
      Serial.println("   전부 OFF");
      mode = AUTO;
      break;
    }
    case 'a': case 'A':
      mode = AUTO; Serial.println("[명령] 자동 순환 모드"); break;
    case 'x': case 'X':
      mode = MANUAL; allOff();
      Serial.println("[명령] 전부 OFF"); break;
    case 't': case 'T':
      relayLowTrig = !relayLowTrig;
      Serial.printf("[명령] 릴레이 극성 반전 → 이제 %s 트리거\n",
                    relayLowTrig ? "LOW" : "HIGH");
      allOff();
      break;
    default:
      Serial.printf("[?] 알 수 없는 입력 '%c'. 사용: 1/2/3/o/a/x/t\n", c);
  }
}

void printHelp() {
  Serial.println();
  Serial.println("============================================");
  Serial.println("   B보드 릴레이 테스트 시작");
  Serial.println("============================================");
  Serial.printf(" 릴레이 트리거 : %s\n", relayLowTrig ? "LOW" : "HIGH");
  Serial.println(" 핀  IO25→펌프1·CH1   IO26→펌프2·CH2   IO27→히터·CH3");
  Serial.println();
  Serial.println(" [시리얼 명령]");
  Serial.println("  1 = 펌프1 5초 / 2 = 펌프2 5초 / 3 = 히터 5초");
  Serial.println("  o = 전부 ON 10초");
  Serial.println("  a = 자동순환  / x = 전부OFF  / t = 극성반전");
  Serial.println("============================================");
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(PIN_PUMP1,  OUTPUT);
  pinMode(PIN_PUMP2,  OUTPUT);
  pinMode(PIN_HEATER, OUTPUT);
  allOff();

  printHelp();

  // 자가테스트: 1초씩 3채널 강제 ON
  Serial.println("[자가테스트] 1초씩 순서대로 ON");
  for (int i = 0; i < 3; i++) {
    Serial.printf("  %s ON\n", CH_NAME[i]);
    drive(CH_PIN[i], true);
    delay(1000);
    drive(CH_PIN[i], false);
  }
  Serial.println("[자가테스트] 완료. 자동 순환 시작.\n");
}

unsigned long lastStep = 0;
int  curCh   = 0;
bool curOn   = true;
const unsigned long ON_MS  = 3000;
const unsigned long OFF_MS = 1000;

void loop() {
  handleSerial();
  if (mode != AUTO) { delay(20); return; }

  unsigned long now = millis();
  unsigned long target = curOn ? ON_MS : OFF_MS;

  if (now - lastStep >= target) {
    lastStep = now;
    if (curOn) {
      // 켜놨던 채널 끄기
      drive(CH_PIN[curCh], false);
      curOn = false;
      Serial.printf("   ↳ %s OFF  (pin %d)\n", CH_NAME[curCh], CH_PIN[curCh]);
    } else {
      // 다음 채널 켜기
      curCh = (curCh + 1) % 3;
      drive(CH_PIN[curCh], true);
      curOn = true;
      Serial.printf(">> %s ON  3초  (pin %d → %s)   |  실측 25:%d 26:%d 27:%d\n",
                    CH_NAME[curCh], CH_PIN[curCh],
                    (relayLowTrig ? "LOW" : "HIGH"),
                    digitalRead(PIN_PUMP1), digitalRead(PIN_PUMP2), digitalRead(PIN_HEATER));
    }
  }
  delay(20);
}
