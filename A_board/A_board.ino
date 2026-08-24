// ===================================================================
//  ESP32 A보드 — 센서 측정 + LCD + ESP-NOW 송신 (브레드보드/버스 배선판)
//  -----------------------------------------------------------------
//  하드웨어: ESP32 38핀 DevKit + GPIO 확장보드(S/V/G 헤더) + 브레드보드
//  배선 원칙(안정성): 전원/GND를 "버스(레일)"로 한 줄씩 정리(데이지체인) +
//    아날로그 라인마다 필터 커패시터(0.1uF~1uF)로 ADC 노이즈 제거.
//  전원 레일 2개:
//    - 5V 레일  : 탁도(SEN0189) · pH(PH4502C) · 수위(XKC-Y25-V) · LCD
//    - 3.3V 레일: 수온(DS18B20) · 조도(GL5528)  (신호가 native 3.3V라 분압 불필요)
//    - GND 레일 : 전 센서/분압/커패시터/ESP32 공통 1점
//  핀(코드 = 실제 배선): DS18B20=IO4, 조도=IO33, 탁도=IO32, pH=IO34, 수위=IO35
//    (아날로그는 전부 ADC1 = IO32~39 → ESP-NOW(WiFi)와 충돌 없음)
//  LCD: RS=IO13 E=IO14 D4=IO27 D5=IO16 D6=IO17 D7=IO18
//  시리얼(115200)에 각 센서 raw값까지 찍어서 배선 문제를 바로 확인 가능
// ===================================================================
#include <OneWire.h>
#include <DallasTemperature.h>
#include <LiquidCrystal.h>
#include <esp_now.h>
#include <WiFi.h>
#include "esp_wifi.h"

// ▼ B보드 STA MAC
uint8_t boardB_mac[] = {0x80, 0xF3, 0xDA, 0x5E, 0x5C, 0x7C};
#define WIFI_CHANNEL 1

// ===== 센서 핀 (확장보드 S 헤더에 꽂힘) =====
#define PIN_DS18B20   4    // IO4   수온  (3.3V 레일, DATA-3.3V 4.7k 풀업)
#define PIN_LDR       33   // IO33  조도  (3.3V 레일, 3.3V-LDR-IO33-10k-GND 분압)
#define PIN_TURBIDITY 32   // IO32  탁도  (5V 레일, OUT-10k-IO32-20k-GND + 0.1uF)
#define PIN_PH        34   // IO34  pH   (5V 레일, 입력전용, PO-10k-IO34-20k-GND + 1uF)
#define PIN_LEVEL     35   // IO35  수위  (5V 레일, 입력전용, OUT-10k-IO35-20k-GND)

// ===== LCD =====
#define LCD_RS 13
#define LCD_EN 14
#define LCD_D4 27
#define LCD_D5 16
#define LCD_D6 17
#define LCD_D7 18
LiquidCrystal lcd(LCD_RS, LCD_EN, LCD_D4, LCD_D5, LCD_D6, LCD_D7);

// ===== 보정 =====
const float DIV_TURB = 1.5;       // 탁도 분압 복원(분압 안 했으면 1.0)
const float DIV_PH   = 1.5;       // pH 분압 복원(분압 안 했으면 1.0)
const float PH_NEUTRAL_V = 2.50;  // pH7 기준 전압
const float PH_SLOPE     = 0.18;
float pH_offset = 0.0;

OneWire oneWire(PIN_DS18B20);
DallasTemperature ds18b20(&oneWire);

typedef struct {
  float tempC; float lux; float turbidity; float ph; int waterLevel;
} SensorData;
SensorData data;

esp_now_peer_info_t peerInfo;
unsigned long lastRead = 0;
const unsigned long READ_INTERVAL = 2000;

// 진단용 raw 보관
int   rawLdr, rawTur, rawPh, rawLevel;
float vTur, vPh;
float lastValidTemp = 25.0;
bool  dsOk = false;

void onSent(const wifi_tx_info_t *info, esp_now_send_status_t status) {}

int analogAvg(int pin, int n = 16) {
  long s = 0;
  for (int i = 0; i < n; i++) { s += analogRead(pin); delayMicroseconds(200); }
  return (int)(s / n);
}

void printLine(int row, const char* s) {
  char b[17]; snprintf(b, sizeof(b), "%-16.16s", s);
  lcd.setCursor(0, row); lcd.print(b);
}

void updateLcd() {
  static int cnt = 0;
  if (++cnt % 5 == 0) lcd.begin(16, 2);
  static int page = 0;
  char l0[20], l1[20];
  switch (page) {
    case 0: snprintf(l0,sizeof(l0),"Water Temp");  snprintf(l1,sizeof(l1), dsOk?"%.1f C":"-- (no sensor)", data.tempC); break;
    case 1: snprintf(l0,sizeof(l0),"pH Level");     snprintf(l1,sizeof(l1),"%.2f", data.ph); break;
    case 2: snprintf(l0,sizeof(l0),"Turbidity");    snprintf(l1,sizeof(l1),"%.0f NTU", data.turbidity); break;
    case 3: snprintf(l0,sizeof(l0),"Light");        snprintf(l1,sizeof(l1),"%.0f %%", data.lux); break;
    case 4: snprintf(l0,sizeof(l0),"Water Level");  snprintf(l1,sizeof(l1),"%s", data.waterLevel?"OK (full)":"LOW !"); break;
  }
  printLine(0,l0); printLine(1,l1); page=(page+1)%5;
}

void readSensors() {
  // 수온
  ds18b20.requestTemperatures();
  float t = ds18b20.getTempCByIndex(0);
  if (t > -50 && t < 85) { lastValidTemp = t; dsOk = true; } else dsOk = false;
  data.tempC = lastValidTemp;

  // 조도
  rawLdr = analogAvg(PIN_LDR);
  data.lux = (rawLdr / 4095.0) * 100.0;

  // 탁도
  rawTur = analogAvg(PIN_TURBIDITY);
  vTur = (rawTur / 4095.0) * 3.3 * DIV_TURB;
  float ntu = (vTur > 4.2) ? 0 : (-1120.4*vTur*vTur + 5742.3*vTur - 4352.9);
  data.turbidity = (ntu < 0) ? 0 : ntu;

  // pH
  rawPh = analogAvg(PIN_PH);
  vPh = (rawPh / 4095.0) * 3.3 * DIV_PH;
  data.ph = 7.0 + ((PH_NEUTRAL_V - vPh) / PH_SLOPE) + pH_offset;
  if (data.ph < 0) data.ph = 0;  if (data.ph > 14) data.ph = 14;

  // 수위 (물 차면 LOW → 반전: 1=정상, 0=부족)
  rawLevel = digitalRead(PIN_LEVEL);
  data.waterLevel = rawLevel ? 0 : 1;
}

void bootDiag() {
  Serial.println("\n========== A보드 센서 진단 시작 ==========");
  ds18b20.begin();
  int n = ds18b20.getDeviceCount();
  Serial.printf("DS18B20 발견: %d개  %s\n", n, n>0?"(OK)":"(데이터선/4.7k풀업/전원 확인!)");
  Serial.printf("초기 ADC raw -> 조도(D33):%d  탁도(D32):%d  pH(D34):%d  수위(D35):%d\n",
                analogAvg(PIN_LDR), analogAvg(PIN_TURBIDITY), analogAvg(PIN_PH), digitalRead(PIN_LEVEL));
  Serial.println("  * raw가 0이거나 4095(최대)면 = 그 센서 신호선이 안 닿음(floating)");
  Serial.println("==========================================\n");
}

void setup() {
  Serial.begin(115200);
  delay(300);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  pinMode(PIN_LEVEL, INPUT);

  lcd.begin(16, 2);
  lcd.print("Aqua Sensor");
  lcd.setCursor(0,1); lcd.print("starting...");

  WiFi.mode(WIFI_STA);
  esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);

  bootDiag();
  Serial.print("A보드 MAC: "); Serial.println(WiFi.macAddress());

  if (esp_now_init() == ESP_OK) {
    esp_now_register_send_cb(onSent);
    memcpy(peerInfo.peer_addr, boardB_mac, 6);
    peerInfo.channel = WIFI_CHANNEL; peerInfo.encrypt = false;
    esp_now_add_peer(&peerInfo);
  } else Serial.println("ESP-NOW 초기화 실패");

  delay(500);
}

void loop() {
  if (millis() - lastRead < READ_INTERVAL) return;
  lastRead = millis();

  readSensors();
  updateLcd();
  esp_now_send(boardB_mac, (uint8_t*)&data, sizeof(data));

  // ── 센서별 진단 출력 (raw값으로 살았는지 바로 확인) ──
  Serial.println("------------------------------------------");
  Serial.printf("수온  D4 : %s %.1f C\n",
                dsOk ? "[OK]" : "[X 미연결/-127]", data.tempC);
  Serial.printf("조도  D33: raw %4d -> %.0f%%   %s\n",
                rawLdr, data.lux, (rawLdr<10||rawLdr>4080)?"<-- floating 의심":"");
  Serial.printf("탁도  D32: raw %4d -> %.2fV -> %.0f NTU   %s\n",
                rawTur, vTur, data.turbidity, (rawTur<10||rawTur>4080)?"<-- floating 의심":"");
  Serial.printf("pH    D34: raw %4d -> %.2fV -> pH %.2f   %s\n",
                rawPh, vPh, data.ph, (rawPh<10||rawPh>4080)?"<-- floating 의심":"");
  Serial.printf("수위  D35: %d -> %s\n", rawLevel, data.waterLevel?"정상(물참)":"부족");
}
