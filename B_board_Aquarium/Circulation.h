#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <math.h>

namespace aquarium {
struct SensorPacket { float ph; float turbVolts; uint8_t waterLow; uint8_t padding[3]; };
static_assert(sizeof(SensorPacket)==12, "Existing Aquarium A packet must stay 12 bytes");
inline bool decodeSensor(const uint8_t* bytes,size_t length,SensorPacket& out) {
  if (!bytes || length!=sizeof(SensorPacket)) return false;
  SensorPacket candidate;memcpy(&candidate,bytes,sizeof(candidate));
  if (!isfinite(candidate.ph) || !isfinite(candidate.turbVolts) || candidate.ph<0 || candidate.ph>14 || candidate.turbVolts<0 || candidate.turbVolts>5 || candidate.waterLow>1) return false;
  out=candidate;return true;
}
enum class Result { Mode,Timing,Emergency,Rejected };
struct Circulation {
  uint8_t mode=0; // OFF at boot. 0=OFF, 1=ON, 2=AUTO.
  uint32_t onSeconds=120,offSeconds=60,phaseSince=0;
  bool phaseOn=true,emergency=false,activeLow=false;
  bool on() const { return !emergency && (mode==1 || (mode==2 && phaseOn)); }
  uint8_t level() const { return on() ? (activeLow?0:1) : (activeLow?1:0); }
  void setMode(uint8_t value,uint32_t now) {
    mode=value;
    if (mode==2) {phaseOn=true;phaseSince=now;}
  }
  void step(uint32_t now) {
    if (mode!=2 || emergency) return;
    const uint32_t period=(onSeconds+offSeconds)*1000U;
    uint32_t elapsed=now-phaseSince;
    phaseSince+=(elapsed/period)*period;elapsed%=period;
    const uint32_t duration=(phaseOn?onSeconds:offSeconds)*1000U;
    if (elapsed>=duration) {phaseSince+=duration;phaseOn=!phaseOn;}
  }
};
inline bool number(const char* begin,const char* end,uint32_t& value) {
  if (begin==end) return false;
  value=0;
  for (const char* p=begin;p!=end;++p) {
    if (*p<'0' || *p>'9' || value>86400) return false;
    value=value*10U+uint32_t(*p-'0');
  }
  return value<=86400;
}
inline Result apply(Circulation& state,const char* text,uint32_t now) {
  if (!text) return Result::Rejected;
  const char* end=text+strlen(text);
  while (end!=text && (end[-1]=='\r' || end[-1]=='\n' || end[-1]==' ')) --end;
  while (text!=end && *text==' ') ++text;
  if (text==end || end-text>47) return Result::Rejected;
  if (text[0]=='C') { // Original C<logical ON>/<logical OFF>, seconds.
    const char* slash=static_cast<const char*>(memchr(text,'/',size_t(end-text)));
    uint32_t logicalOn,logicalOff;
    if (!slash || !number(text+1,slash,logicalOn) || !number(slash+1,end,logicalOff) || logicalOn<1 || logicalOff<1) return Result::Rejected;
    // Current physical circulation is opposite to the old logical phase.
    state.offSeconds=logicalOn;state.onSeconds=logicalOff;state.phaseSince=now;
    return Result::Timing;
  }
  if (end-text==2 && text[0]=='E' && (text[1]=='0' || text[1]=='1')) {
    state.emergency=text[1]=='1';
    if (!state.emergency && state.mode==2) {state.phaseOn=true;state.phaseSince=now;}
    return Result::Emergency;
  }
  const char* eq=static_cast<const char*>(memchr(text,'=',size_t(end-text)));
  uint32_t value;
  if (!eq || !number(eq+1,end,value)) return Result::Rejected;
  const size_t keyLength=size_t(eq-text);
  if (keyLength==9 && memcmp(text,"pump2Mode",9)==0 && value<=2) {state.setMode(uint8_t(value),now);return Result::Mode;}
  if (keyLength==6 && memcmp(text,"circOn",6)==0 && value>=1 && value<=1440) {state.onSeconds=value*60;state.phaseSince=now;return Result::Timing;}
  if (keyLength==7 && memcmp(text,"circOff",7)==0 && value>=1 && value<=1440) {state.offSeconds=value*60;state.phaseSince=now;return Result::Timing;}
  return Result::Rejected;
}
}
