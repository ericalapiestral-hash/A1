#pragma once
#include "Circulation.h"

namespace aquarium {
enum class HeaterResult {Mode,Check,Rejected};
struct ManualHeater {
  uint8_t mode=0,polarity=0,checkLevel=1;
  bool checking=false;
  uint32_t checkSince=0;
  bool configured() const {return polarity==1 || polarity==2;}
  bool on() const {return configured() && mode==1 && !checking;}
  uint8_t level() const {
    if(checking)return checkLevel;
    if(!configured())return 1; // Preserve previous HIGH; physical OFF is unknown.
    return polarity==1 ? !on() : on();
  }
  void stop(){mode=0;checking=false;}
  void step(uint32_t now){if(checking && uint32_t(now-checkSince)>=5000)checking=false;}
};
inline HeaterResult applyHeater(ManualHeater& heater,const char* text,uint32_t now,bool allowOn,bool serialCheck=false){
  if(!text)return HeaterResult::Rejected;
  const char* end=text+strlen(text);
  while(end!=text && (end[-1]=='\r'||end[-1]=='\n'||end[-1]==' '))--end;
  while(text!=end && *text==' ')++text;
  if(end-text==12 && memcmp(text,"heaterMode=",11)==0 && (text[11]=='0'||text[11]=='1')){
    if(!heater.configured() || (text[11]=='1'&&!allowOn))return HeaterResult::Rejected;
    heater.mode=uint8_t(text[11]-'0');heater.checking=false;return HeaterResult::Mode;
  }
  // Relay inspection is USB-only, unconfigured only, and bounded to 5 seconds.
  // All load power must be physically disconnected before using this command.
  if(serialCheck && !heater.configured()){
    if(end-text==9 && memcmp(text,"check18=",8)==0 && (text[8]=='0'||text[8]=='1')){
      heater.mode=0;heater.checkLevel=uint8_t(text[8]-'0');heater.checkSince=now;heater.checking=true;return HeaterResult::Check;
    }
    if(end-text==12 && memcmp(text,"check18=stop",12)==0){heater.stop();return HeaterResult::Check;}
  }
  return HeaterResult::Rejected;
}
}
