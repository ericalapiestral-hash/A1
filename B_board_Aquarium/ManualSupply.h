#pragma once
#include "Circulation.h"

namespace aquarium {
struct ManualSupply {
  uint8_t mode=0;
  // 0=unconfigured (preserve previous HIGH), 1=HIGH is OFF, 2=LOW is OFF.
  uint8_t polarity=0;
  bool configured() const {return polarity==1 || polarity==2;}
  bool on(bool emergency=false) const {return configured() && mode==1 && !emergency;}
  uint8_t level(bool emergency=false) const {
    if (!configured()) return 1;
    return polarity==1 ? !on(emergency) : on(emergency);
  }
};
inline Result applySupply(ManualSupply& supply,const char* text) {
  if (!text || !supply.configured()) return Result::Rejected;
  const char* end=text+strlen(text);
  while(end!=text && (end[-1]=='\r' || end[-1]=='\n' || end[-1]==' ')) --end;
  while(text!=end && *text==' ') ++text;
  if(end-text!=11 || memcmp(text,"pump1Mode=",10)!=0 || (text[10]!='0' && text[10]!='1')) return Result::Rejected;
  supply.mode=uint8_t(text[10]-'0');return Result::Mode;
}
}
