// ===================================================================
//  순환펌프 타이머 컨트롤러 (독립 실행) — 협신 UP200
//  -----------------------------------------------------------------
//  펌프: 협신워터디자인 UP200  (단상 220V AC · 20W · 수중모터)
//  제어: 릴레이 1채널로 펌프 전원코드의 "활선(L)"을 잘라 직렬 삽입.
//        릴레이 ON = 접점 붙음 = 펌프 ON.  (중성선 N 은 안 자르고 그대로 통과)
//  타이머: onMin 분 ON  →  offMin 분 OFF  무한 반복 (기본 5분 / 25분)
//  -----------------------------------------------------------------
//  핀: IO26 = 릴레이 IN (B보드의 '순환' 채널 CH2 와 동일 핀).
//      LOW 트리거 릴레이 모듈 기준(LOW=ON). 반대로 동작하면 't'로 토글.
//      릴레이 VCC=5V, GND=ESP32와 공통.  릴레이는 250VAC 정격 제품 사용.
//  ※ 이 스케치는 B보드와 별도로 ESP32 하나에 올려 "순환펌프만" 굴려도 되고,
//    B보드에 이미 있는 순환 타이머와 동일 로직이라 참고용으로도 사용 가능.
//  시리얼(115200) 명령:
//      on=10   → ON 시간 10분으로 설정
//      off=20  → OFF 시간 20분으로 설정
//      1 / 0   → 강제 ON / 강제 OFF (수동)
//      a       → 자동 타이머 모드(기본)
//      t       → 릴레이 극성 반전(LOW↔HIGH)
//      s       → 현재 상태 출력
// ===================================================================

#define PIN_PUMP 26            // 릴레이 IN (순환 채널)
bool relayLowTrig = true;      // LOW 트리거 모듈이면 true

// 타이머 설정(분) — 전과 동일한 순환 주기 기본값
unsigned int onMin  = 5;       // ON 유지 시간(분)
unsigned int offMin = 25;      // OFF 유지 시간(분)

enum Mode { AUTO, FORCE_ON, FORCE_OFF };
Mode mode = AUTO;

bool pumpOn = false;           // 현재 펌프 상태
bool runPhase = true;          // 자동 모드 위상: true=ON구간, false=OFF구간
unsigned long phaseStart = 0;  // 현재 위상 시작 시각(ms)

void drive(bool on) {
  pumpOn = on;
  digitalWrite(PIN_PUMP, (on ^ relayLowTrig) ? HIGH : LOW);
}

void printStatus() {
  unsigned long remainMs;
  if (mode == AUTO) {
    unsigned long target = (runPhase ? onMin : offMin) * 60000UL;
    unsigned long el = millis() - phaseStart;
    remainMs = (el < target) ? (target - el) : 0;
    Serial.printf("[상태] %s | 위상:%s | 남은시간:%lu초 | 주기 ON %u분/OFF %u분 | pin26:%d(%s)\n",
                  pumpOn ? "펌프 ON" : "펌프 OFF",
                  runPhase ? "ON구간" : "OFF구간",
                  remainMs / 1000UL, onMin, offMin,
                  digitalRead(PIN_PUMP), relayLowTrig ? "LOW=ON" : "HIGH=ON");
  } else {
    Serial.printf("[상태] 수동 %s | pin26:%d(%s)\n",
                  pumpOn ? "강제 ON" : "강제 OFF",
                  digitalRead(PIN_PUMP), relayLowTrig ? "LOW=ON" : "HIGH=ON");
  }
}

void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return;

  if (line.startsWith("on=")) {
    onMin = (unsigned)line.substring(3).toInt();
    if (onMin == 0) onMin = 1;
    Serial.printf("[설정] ON 시간 = %u분\n", onMin);
  } else if (line.startsWith("off=")) {
    offMin = (unsigned)line.substring(4).toInt();
    if (offMin == 0) offMin = 1;
    Serial.printf("[설정] OFF 시간 = %u분\n", offMin);
  } else if (line == "1") {
    mode = FORCE_ON;  drive(true);  Serial.println("[명령] 강제 ON");
  } else if (line == "0") {
    mode = FORCE_OFF; drive(false); Serial.println("[명령] 강제 OFF");
  } else if (line == "a" || line == "A") {
    mode = AUTO; runPhase = true; phaseStart = millis(); drive(true);
    Serial.println("[명령] 자동 타이머 모드 (ON구간부터 시작)");
  } else if (line == "t" || line == "T") {
    relayLowTrig = !relayLowTrig; drive(pumpOn);   // 상태 유지하며 극성만 반전
    Serial.printf("[명령] 릴레이 극성 → %s\n", relayLowTrig ? "LOW=ON" : "HIGH=ON");
  } else if (line == "s" || line == "S") {
    printStatus();
  } else {
    Serial.printf("[?] 알 수 없는 입력 '%s'  (on= / off= / 1 / 0 / a / t / s)\n", line.c_str());
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(PIN_PUMP, OUTPUT);
  drive(false);                       // 시작은 OFF (안전)

  Serial.println("\n==================================================");
  Serial.println("  순환펌프 타이머 — 협신 UP200 (220V, 릴레이 직렬)");
  Serial.println("==================================================");
  Serial.printf(" 핀 IO26 → 릴레이 IN  (%s)\n", relayLowTrig ? "LOW=ON" : "HIGH=ON");
  Serial.printf(" 기본 주기: ON %u분 / OFF %u분\n", onMin, offMin);
  Serial.println(" 명령: on= / off= / 1 / 0 / a / t / s");
  Serial.println("--------------------------------------------------");

  // 자가테스트: 1초 ON 후 OFF (배선/릴레이 점검)
  Serial.println("[자가테스트] 1초 ON");
  drive(true);  delay(1000);  drive(false);
  Serial.println("[자가테스트] 완료. 자동 타이머 시작.");

  mode = AUTO; runPhase = true; phaseStart = millis(); drive(true);
}

void loop() {
  handleSerial();

  if (mode == AUTO) {
    unsigned long target = (runPhase ? onMin : offMin) * 60000UL;
    if (millis() - phaseStart >= target) {
      runPhase = !runPhase;           // 위상 전환
      phaseStart = millis();
      drive(runPhase);                // ON구간이면 ON, OFF구간이면 OFF
      Serial.printf(">> 위상 전환 → %s (%u분)\n",
                    runPhase ? "펌프 ON" : "펌프 OFF",
                    runPhase ? onMin : offMin);
    }
  }

  // 5초마다 상태 한 줄 출력
  static unsigned long t = 0;
  if (millis() - t >= 5000) { t = millis(); printStatus(); }

  delay(20);
}
