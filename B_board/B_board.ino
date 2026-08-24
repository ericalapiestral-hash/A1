// ===================================================================
//  ESP32 B보드 (BLE 전용) — ESP-NOW 수신 + 블루투스(BLE) 서버
//  -----------------------------------------------------------------
//  A보드 → (ESP-NOW, 채널1) → B보드 : 센서값(수온/조도/탁도/pH/수위)
//  B보드 → BLE(기기명 "AquaControl") → 폰 앱 직접 연결
//    status 특성(notify) : 상태 JSON 푸시
//    cmd    특성(write)  : "key=value" 명령 수신 (heaterMode, tempSet ...)
//  -----------------------------------------------------------------
//  하드웨어: ESP32 WROOM-32 + 3채널 릴레이 모듈 (LOW 트리거)
//  배선 원칙(안정성): 릴레이 VCC/GND·ESP32를 공통 GND 버스로 1점 접지 +
//    릴레이 모듈 VCC-GND 사이 10uF/0.1uF 디커플링으로 코일 스파이크 흡수.
//  핀: IO25=펌프1(급수)/CH1, IO26=펌프2(순환)/CH2, IO27=히터/CH3  (LOW=ON)
//      산소(oxygen)는 핀 없는 로직 전용 (상태/타이머만, 출력 안 함)
//  ※ 필요한 라이브러리: Library Manager에서 "NimBLE-Arduino" 설치
// ===================================================================
#include <esp_now.h>
#include <WiFi.h>
#include "esp_wifi.h"
#include "esp_mac.h"
#include <NimBLEDevice.h>

#define WIFI_CHANNEL 1
#define PIN_PUMP1  25   // 급수 (릴레이 CH1)
#define PIN_PUMP2  26   // 순환 (릴레이 CH2)
#define PIN_HEATER 27
const bool RELAY_LOW_TRIG = true;   // 반대로 동작하면 false

// 앱과 동일한 BLE UUID (Nordic UART 형식)
#define SVC_UUID    "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CMD_UUID    "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // 앱 → 보드 (write)
#define STATUS_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // 보드 → 앱 (notify)

// A보드와 동일 구조체
typedef struct { float tempC; float lux; float turbidity; float ph; int waterLevel; } SensorData;
SensorData sensor;
unsigned long lastRecv = 0;
bool haveData = false;

// 제어 상태 (앱이 cmd로 변경) — 0=끄기 1=켜기 2=자동
int   heaterMode = 2, oxygenMode = 2, pump1Mode = 2, pump2Mode = 2;
float tempSet = 25.0, tempHyst = 0.5;
int   oxyOn = 15, oxyOff = 15, circOn = 5, circOff = 25;

bool heaterOn = false, oxygenOn = false, pump1On = false, pump2On = false;
unsigned long circTimer = 0; bool circPhase = true;
unsigned long oxyTimer  = 0; bool oxyPhase  = true;

NimBLECharacteristic* pStatus = nullptr;
bool bleConnected = false;

void drive(int pin, bool on) {
  int lvl = (on ^ RELAY_LOW_TRIG) ? HIGH : LOW;
  digitalWrite(pin, lvl);
}

// ---------------- 제어 로직 ----------------
void control() {
  unsigned long ce = (millis() - circTimer) / 60000UL;
  if (circPhase  && ce >= (unsigned)circOn)  { circPhase = false; circTimer = millis(); }
  if (!circPhase && ce >= (unsigned)circOff) { circPhase = true;  circTimer = millis(); }

  unsigned long oe = (millis() - oxyTimer) / 60000UL;
  if (oxyPhase  && oe >= (unsigned)oxyOn)  { oxyPhase = false; oxyTimer = millis(); }
  if (!oxyPhase && oe >= (unsigned)oxyOff) { oxyPhase = true;  oxyTimer = millis(); }

  if (heaterMode == 2) {
    if (!haveData)                              heaterOn = false;
    else if (sensor.tempC < tempSet - tempHyst) heaterOn = true;
    else if (sensor.tempC > tempSet + tempHyst) heaterOn = false;
  } else heaterOn = (heaterMode == 1);

  // 급수: 수위 부족(0)이면 급수, 적정 수위(1)로 올라오면 정지
  if (pump1Mode == 2) pump1On = haveData && sensor.waterLevel == 0;
  else                pump1On = (pump1Mode == 1);

  if (pump2Mode == 2) pump2On = circPhase;                           // 순환(주기)
  else                pump2On = (pump2Mode == 1);

  if (oxygenMode == 2) oxygenOn = oxyPhase;   // 산소(논리 전용, 핀 없음)
  else                 oxygenOn = (oxygenMode == 1);

  drive(PIN_PUMP1,  pump1On);
  drive(PIN_PUMP2,  pump2On);
  drive(PIN_HEATER, heaterOn);
}

String boolStr(bool b) { return b ? "true" : "false"; }

String statusJson() {
  String j = "{";
  j += "\"temp\":"  + String(sensor.tempC, 1) + ",";
  j += "\"ph\":"    + String(sensor.ph, 2) + ",";
  j += "\"turb\":"  + String(sensor.turbidity, 0) + ",";
  j += "\"lux\":"   + String(sensor.lux, 0) + ",";
  j += "\"level\":" + String(haveData ? sensor.waterLevel : 1) + ",";
  j += "\"heaterMode\":" + String(heaterMode) + ",";
  j += "\"oxygenMode\":" + String(oxygenMode) + ",";
  j += "\"pump1Mode\":"  + String(pump1Mode) + ",";
  j += "\"pump2Mode\":"  + String(pump2Mode) + ",";
  j += "\"tempSet\":"    + String(tempSet, 1) + ",";
  j += "\"oxyOn\":"  + String(oxyOn) + ",";
  j += "\"oxyOff\":" + String(oxyOff) + ",";
  j += "\"circOn\":" + String(circOn) + ",";
  j += "\"circOff\":"+ String(circOff) + ",";
  j += "\"heaterOn\":" + boolStr(heaterOn) + ",";
  j += "\"oxygenOn\":" + boolStr(oxygenOn) + ",";
  j += "\"pump1On\":"  + boolStr(pump1On) + ",";
  j += "\"pump2On\":"  + boolStr(pump2On);
  j += "}";
  return j;
}

void applyKey(const String& k, const String& v) {
  if      (k == "heaterMode") heaterMode = v.toInt();
  else if (k == "oxygenMode") oxygenMode = v.toInt();
  else if (k == "pump1Mode")  pump1Mode  = v.toInt();
  else if (k == "pump2Mode")  pump2Mode  = v.toInt();
  else if (k == "tempSet")    tempSet    = v.toFloat();
  else if (k == "oxyOn")      oxyOn      = v.toInt();
  else if (k == "oxyOff")     oxyOff     = v.toInt();
  else if (k == "circOn")     circOn     = v.toInt();
  else if (k == "circOff")    circOff    = v.toInt();
}

// 상태 JSON을 20바이트씩 쪼개 notify (+ 끝에 줄바꿈) — 앱이 '\n' 기준으로 조립
void notifyStatus() {
  if (!bleConnected || !pStatus) return;
  String j = statusJson() + "\n";
  const int CH = 20;
  for (int i = 0; i < (int)j.length(); i += CH) {
    int end = i + CH; if (end > (int)j.length()) end = j.length();
    String part = j.substring(i, end);
    pStatus->setValue((uint8_t*)part.c_str(), part.length());
    pStatus->notify();
    delay(8);
  }
}

// ---------------- BLE 콜백 (NimBLE 2.x) ----------------
class CmdCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& info) override {
    String v = String(c->getValue().c_str());
    v.trim();                          // \r\n 제거
    Serial.printf("[CMD수신] '%s'\n", v.c_str());   // ← 명령 도착 확인용
    int eq = v.indexOf('=');
    if (eq > 0) {
      applyKey(v.substring(0, eq), v.substring(eq + 1));
      control();
      Serial.printf("  적용됨 -> heaterMode:%d pump1:%d pump2:%d tempSet:%.1f circOn:%d circOff:%d\n",
                    heaterMode, pump1Mode, pump2Mode, tempSet, circOn, circOff);
    }
  }
};

class SrvCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override { bleConnected = true; }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& info, int reason) override {
    bleConnected = false;
    NimBLEDevice::startAdvertising();  // 끊기면 다시 광고
  }
};

// ---------------- ESP-NOW ----------------
void onRecv(const esp_now_recv_info_t *info, const uint8_t *incoming, int len) {
  if (len == sizeof(SensorData)) {
    memcpy(&sensor, incoming, sizeof(sensor));
    lastRecv = millis();
    haveData = true;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PUMP1, OUTPUT); pinMode(PIN_PUMP2, OUTPUT); pinMode(PIN_HEATER, OUTPUT);
  drive(PIN_PUMP1, false); drive(PIN_PUMP2, false); drive(PIN_HEATER, false);

  // 부팅시 자가테스트: 펌프1→펌프2→히터 순서로 1초씩 ON (배선/릴레이 점검용)
  Serial.println("[자가테스트] 펌프1(급수) ON 1초");
  drive(PIN_PUMP1, true);  delay(1000); drive(PIN_PUMP1, false);
  Serial.println("[자가테스트] 펌프2(순환) ON 1초");
  drive(PIN_PUMP2, true);  delay(1000); drive(PIN_PUMP2, false);
  Serial.println("[자가테스트] 히터 ON 1초");
  drive(PIN_HEATER, true); delay(1000); drive(PIN_HEATER, false);
  Serial.println("[자가테스트] 완료");

  // WiFi STA: ESP-NOW 수신 전용 (핫스팟/서버 없음)
  WiFi.mode(WIFI_STA);
  esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  Serial.printf("B보드 STA MAC: %02X:%02X:%02X:%02X:%02X:%02X (A보드에 입력)\n",
                mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  if (esp_now_init() != ESP_OK) { Serial.println("ESP-NOW 초기화 실패"); return; }
  esp_now_register_recv_cb(onRecv);

  // BLE 서버 (ESP-NOW와 동시 동작)
  NimBLEDevice::init("AquaControl");
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new SrvCB());
  NimBLEService* svc = server->createService(SVC_UUID);
  pStatus = svc->createCharacteristic(STATUS_UUID, NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic* pCmd =
      svc->createCharacteristic(CMD_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  pCmd->setCallbacks(new CmdCB());
  svc->start();

  // 광고엔 기기명만 (128bit 서비스 UUID는 31바이트 초과로 이름이 가려질 수 있어 제외)
  // 앱은 기기명 "AquaControl" 로 검색하고, 서비스는 연결 후 검색함
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->setName("AquaControl");
  adv->enableScanResponse(true);
  bool advOk = adv->start();
  Serial.println(advOk ? "BLE 광고 시작: AquaControl" : "BLE 광고 시작 실패!");

  circTimer = oxyTimer = millis();
}

void loop() {
  if (millis() - lastRecv > 15000) haveData = false;  // A보드 끊기면 히터 안전 OFF
  control();
  static unsigned long t = 0, td = 0;
  if (millis() - t >= 1000) { t = millis(); notifyStatus(); }  // 1초마다 상태 푸시

  // 2초마다 모드·계산결과·실제 핀 출력을 한 줄로 표시 (제어 진단)
  if (millis() - td >= 2000) {
    td = millis();
    Serial.printf("[상태] mode P1:%d P2:%d H:%d | on P1:%d P2:%d H:%d | pin25:%d pin26:%d pin27:%d | lvl:%d haveData:%d\n",
      pump1Mode, pump2Mode, heaterMode,
      pump1On, pump2On, heaterOn,
      digitalRead(PIN_PUMP1), digitalRead(PIN_PUMP2), digitalRead(PIN_HEATER),
      sensor.waterLevel, haveData);
  }
  delay(20);
}
