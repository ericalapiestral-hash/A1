// New source based on the provided Aquarium BLE v2 backup, not recovered source.
// Manual supply IO16 and circulation IO17; existing LCD 13,14,27,26,25,33.
// Supply polarity is configured by the updater from a physical observation.
// Heater IO18 keeps its original HIGH; its power must remain disconnected.
#include <Arduino.h>
#include <atomic>
#include <LiquidCrystal.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <driver/gpio.h>
#include "Circulation.h"
#include "ManualSupply.h"

using namespace aquarium;
static constexpr int CIR_PIN=17;
static constexpr int SUP_PIN=16;
static constexpr char SERVICE_UUID[]="4f7f1234-1234-5678-1234-aaaa00000001";
static constexpr char STATUS_UUID[]="4f7f1234-1234-5678-1234-aaaa00000002";
static constexpr char COMMAND_UUID[]="4f7f1234-1234-5678-1234-aaaa00000003";
struct PeerConfig {char marker[32];uint8_t mac[6];uint8_t supplyPolarity;uint8_t reserved;};
static_assert(sizeof(PeerConfig)==40,"Peer configuration layout");
// The updater copies the original sender whitelist here locally. No device MAC
// is embedded in the public source/template. Volatile prevents zero-folding.
const volatile PeerConfig peerConfig __attribute__((used))={"AQUA_A_PEER_V1",{0,0,0,0,0,0},0,0};
LiquidCrystal lcd(13,14,27,26,25,33);
Circulation circulation;
ManualSupply supply;
SensorPacket latestSensor{};
uint32_t lastSensor=0;
bool haveSensor=false,peerReady=false;
uint8_t allowedPeer[6]{};
portMUX_TYPE sensorLock=portMUX_INITIALIZER_UNLOCKED;
struct QueuedCommand {char text[48];};
QueueHandle_t commands=nullptr;
NimBLECharacteristic* statusCharacteristic=nullptr;
std::atomic<bool> bleConnected{false},subscribed{false},sendSoon{true};

void receiveSensor(const esp_now_recv_info_t* info,const uint8_t* data,int length) {
  if (!peerReady || !info || length<0 || memcmp(info->src_addr,allowedPeer,6)!=0) return;
  SensorPacket packet;
  if (!decodeSensor(data,size_t(length),packet)) return;
  portENTER_CRITICAL(&sensorLock);
  latestSensor=packet;lastSensor=millis();haveSensor=true;
  portEXIT_CRITICAL(&sensorLock);
}
String statusJson() {
  SensorPacket packet;uint32_t received;bool have;
  portENTER_CRITICAL(&sensorLock);
  packet=latestSensor;received=lastSensor;have=haveSensor;
  portEXIT_CRITICAL(&sensorLock);
  const bool online=have && uint32_t(millis()-received)<8000;
  String j="{\"firmware\":\"Aquarium-pumps-1.1.0\",\"manualSupplySupported\":"+String(supply.configured()?"true":"false")+",";
  j+="\"sensorOnline\":"+String(online?"true":"false")+",\"online\":"+String(online?1:0);
  j+=",\"ph\":"+(online?String(packet.ph,2):String("null"));
  j+=",\"turb\":"+(online?String(packet.turbVolts,3):String("null"))+",\"turbUnit\":\"V\"";
  j+=",\"level\":"+(online?String(packet.waterLow?0:1):String("null"));
  j+=",\"water_low\":"+(online?String(packet.waterLow):String("null"));
  j+=",\"pump1Mode\":"+(supply.configured()?String(supply.mode):String("null"));
  j+=",\"pump1On\":"+(supply.configured()?String(supply.on(circulation.emergency)?"true":"false"):String("null"));
  j+=",\"pin16\":"+String(digitalRead(SUP_PIN));
  j+=",\"pump2Mode\":"+String(circulation.mode)+",\"pump2On\":"+String(circulation.on()?"true":"false");
  j+=",\"circOn\":"+String(circulation.onSeconds/60.0,3)+",\"circOff\":"+String(circulation.offSeconds/60.0,3);
  j+=",\"cir\":"+String(circulation.on()?0:1)+",\"pin17\":"+String(digitalRead(CIR_PIN));
  j+=",\"estop\":"+String(circulation.emergency?1:0)+",\"peerConfigured\":"+String(peerReady?"true":"false");
  j+=",\"tempSensorEnabled\":false,\"heaterAutoSupported\":false}";
  return j;
}
class ServerCallbacks:public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*,NimBLEConnInfo&) override {bleConnected=true;sendSoon=true;Serial.println("[BLE] 연결됨");}
  void onDisconnect(NimBLEServer*,NimBLEConnInfo&,int) override {bleConnected=false;subscribed=false;NimBLEDevice::startAdvertising();}
};
class StatusCallbacks:public NimBLECharacteristicCallbacks {
  void onSubscribe(NimBLECharacteristic*,NimBLEConnInfo&,uint16_t value) override {subscribed=(value&1)!=0;sendSoon=true;}
};
class CommandCallbacks:public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* characteristic,NimBLEConnInfo&) override {
    const std::string value=characteristic->getValue();
    if (value.empty() || value.size()>=sizeof(QueuedCommand::text) || value.find('\0')!=std::string::npos) {Serial.println("[CMD REJECTED] invalid length");return;}
    QueuedCommand item{};memcpy(item.text,value.data(),value.size());
    if (xQueueSend(commands,&item,0)!=pdTRUE) Serial.println("[CMD REJECTED] queue full");
  }
};
void publishStatus() {
  const String j=statusJson();
  Serial.println(j);
  if (bleConnected && subscribed) {
    const String frame=j+"\n";
    for (unsigned i=0;i<frame.length();i+=20) {
      const String part=frame.substring(i,i+20);
      statusCharacteristic->setValue(part.c_str());statusCharacteristic->notify();delay(3);
    }
  }
  statusCharacteristic->setValue(j.c_str()); // Complete value for initial reads.
}
void lcdLine(int row,const char* text) {
  char padded[17];snprintf(padded,sizeof(padded),"%-16.16s",text);lcd.setCursor(0,row);lcd.print(padded);
}
void updateLcd() {
  static uint8_t page=0;char first[24],second[24];
  SensorPacket packet;uint32_t received;bool have;
  portENTER_CRITICAL(&sensorLock);packet=latestSensor;received=lastSensor;have=haveSensor;portEXIT_CRITICAL(&sensorLock);
  const bool online=have && uint32_t(millis()-received)<8000;
  switch (page++%5) {
    case 0:snprintf(first,sizeof(first),"Circ: %s",circulation.on()?"ON":"OFF");snprintf(second,sizeof(second),"Mode:%s IO17:%d",circulation.mode==0?"OFF":circulation.mode==1?"ON":"AUTO",digitalRead(CIR_PIN));break;
    case 1:if(online){snprintf(first,sizeof(first),"pH: %.2f",packet.ph);snprintf(second,sizeof(second),"Turb: %.3fV",packet.turbVolts);}else{strcpy(first,"pH: --");strcpy(second,"Turb: --");}break;
    case 2:snprintf(first,sizeof(first),"Water:%s",online?(packet.waterLow?"LOW":"OK"):"--");snprintf(second,sizeof(second),"Sensor:%s",online?"online":"offline");break;
    case 3:snprintf(first,sizeof(first),"Supply: %s",supply.configured()?(supply.on(circulation.emergency)?"ON":"OFF"):"SETUP");snprintf(second,sizeof(second),"Manual IO16:%d",digitalRead(SUP_PIN));break;
    default:snprintf(first,sizeof(first),"Circ %lu/%lus",(unsigned long)circulation.onSeconds,(unsigned long)circulation.offSeconds);snprintf(second,sizeof(second),"BLE:%s",bleConnected?"connected":"advertising");break;
  }
  lcdLine(0,first);lcdLine(1,second);
}
void setup() {
  // Observed existing hardware runs when IO17 is HIGH. OFF is LOW here.
  // Arduino 3.x ignores digitalWrite before a pin is registered as GPIO.
  // Set the hardware latch first, then enable output and assert the level.
  gpio_set_level(GPIO_NUM_17,0);pinMode(CIR_PIN,OUTPUT);digitalWrite(CIR_PIN,LOW);
  supply.polarity=peerConfig.supplyPolarity;
  gpio_set_level(GPIO_NUM_16,supply.level());pinMode(SUP_PIN,OUTPUT);digitalWrite(SUP_PIN,supply.level());
  gpio_set_level(GPIO_NUM_18,1);pinMode(18,OUTPUT);digitalWrite(18,HIGH);
  pinMode(2,OUTPUT);digitalWrite(2,LOW);
  Serial.begin(115200);delay(300);
  Serial.println("Aquarium pumps 1.1.0: manual supply IO16, circulation IO17, boot OFF");
  if(!supply.configured()) Serial.println("[SUPPLY] polarity not configured; commands disabled, IO16 kept HIGH");
  for (size_t i=0;i<6;++i){allowedPeer[i]=peerConfig.mac[i];peerReady|=allowedPeer[i]!=0;}
  Serial.println(peerReady?"[ESP-NOW] original A sender filter configured":"[ESP-NOW] no configured A sender; use the matched-backup updater");
  lcd.begin(16,2);lcdLine(0,"Aquarium Pumps");lcdLine(1,"Boot: OFF");
  WiFi.mode(WIFI_STA);esp_wifi_set_channel(1,WIFI_SECOND_CHAN_NONE);
  if (esp_now_init()==ESP_OK) esp_now_register_recv_cb(receiveSensor);else Serial.println("[ESP-NOW] init failed");
  commands=xQueueCreate(8,sizeof(QueuedCommand));
  if (!commands) {Serial.println("[ERROR] command queue allocation failed");return;}
  NimBLEDevice::init("Aquarium");NimBLEDevice::setMTU(247);
  auto* server=NimBLEDevice::createServer();server->setCallbacks(new ServerCallbacks);
  auto* service=server->createService(SERVICE_UUID);
  statusCharacteristic=service->createCharacteristic(STATUS_UUID,NIMBLE_PROPERTY::READ|NIMBLE_PROPERTY::NOTIFY);
  statusCharacteristic->setCallbacks(new StatusCallbacks);statusCharacteristic->setValue(statusJson().c_str());
  auto* command=service->createCharacteristic(COMMAND_UUID,NIMBLE_PROPERTY::WRITE|NIMBLE_PROPERTY::WRITE_NR);command->setCallbacks(new CommandCallbacks);
  service->start();auto* advertising=NimBLEDevice::getAdvertising();advertising->addServiceUUID(SERVICE_UUID);advertising->enableScanResponse(true);advertising->setName("Aquarium");advertising->start();
}
void loop() {
  const uint32_t now=millis();QueuedCommand item;
  while (commands && xQueueReceive(commands,&item,0)==pdTRUE) {
    Serial.printf("[BLE CMD] %s\n",item.text);
    Result result=applySupply(supply,item.text);
    if(result==Result::Rejected) result=apply(circulation,item.text,now);
    circulation.step(now);digitalWrite(CIR_PIN,circulation.level());
    digitalWrite(SUP_PIN,supply.level(circulation.emergency));
    if (result==Result::Rejected) Serial.println("[CMD REJECTED] unsupported command, range or supply not configured");
    else Serial.printf("[CMD APPLIED] pump1Mode=%u on=%u pin16=%u | pump2Mode=%u on=%u pin17=%u\n",supply.mode,supply.on(circulation.emergency),digitalRead(SUP_PIN),circulation.mode,circulation.on(),digitalRead(CIR_PIN));
    sendSoon=true;
  }
  circulation.step(now);digitalWrite(CIR_PIN,circulation.level());
  digitalWrite(SUP_PIN,supply.level(circulation.emergency));
  digitalWrite(2,bleConnected?HIGH:LOW);
  static uint32_t lastStatus=0,lastLcd=0;
  if (statusCharacteristic && (sendSoon || uint32_t(now-lastStatus)>=1000)) {sendSoon=false;lastStatus=now;publishStatus();}
  if (uint32_t(now-lastLcd)>=3000) {lastLcd=now;updateLcd();}
  delay(10);
}
