#include "../../../B_board_Aquarium/Circulation.h"
#include <assert.h>
#include <limits>
#include <initializer_list>
using namespace aquarium;
int main() {
  Circulation state;
  assert(!state.on() && state.level()==0);
  assert(apply(state,"pump2Mode=1\n",0)==Result::Mode);
  state.step(86400000);assert(state.on() && state.level()==1);
  assert(apply(state,"pump2Mode=0",86400000)==Result::Mode);
  for(uint32_t t:{86400000U,172800000U,0xffffffffU,123U}){state.step(t);assert(!state.on() && state.level()==0);}
  assert(apply(state,"pump2Mode=2",0)==Result::Mode);
  state.step(119999);assert(state.on());state.step(120000);assert(!state.on());state.step(179999);assert(!state.on());state.step(180000);assert(state.on());
  state.step(180000*100+120000);assert(!state.on());
  state.setMode(2,0xfffffff0);state.step(uint32_t(0xfffffff0U+120000U));assert(!state.on());
  assert(apply(state,"E1",1)==Result::Emergency);assert(!state.on());
  assert(apply(state,"pump2Mode=1",2)==Result::Mode);assert(!state.on());
  assert(apply(state,"E0",3)==Result::Emergency);assert(state.on());
  state.activeLow=true;assert(state.level()==0);state.setMode(0,4);assert(state.level()==1);
  assert(apply(state,"C60/120",0)==Result::Timing);assert(state.onSeconds==120 && state.offSeconds==60);
  assert(apply(state,"circOn=10",0)==Result::Timing);assert(state.onSeconds==600);
  assert(apply(state,"circOff=2",0)==Result::Timing);assert(state.offSeconds==120);
  for(const char* text:{"pump2Mode=-1","pump2Mode=3","pump2Mode=0abc","C0/120","C60/9999999999999999","C60/0","heaterMode=1","circOn=0","circOff=1441"}) {
    const uint8_t mode=state.mode;const uint32_t on=state.onSeconds,off=state.offSeconds;
    assert(apply(state,text,0)==Result::Rejected);assert(state.mode==mode && state.onSeconds==on && state.offSeconds==off);
  }
  SensorPacket packet{9.7f,3.118f,1,{0}},out{};
  assert(decodeSensor(reinterpret_cast<const uint8_t*>(&packet),12,out));assert(out.waterLow==1);
  assert(!decodeSensor(reinterpret_cast<const uint8_t*>(&packet),16,out));
  packet.waterLow=2;assert(!decodeSensor(reinterpret_cast<const uint8_t*>(&packet),12,out));
  packet.waterLow=1;packet.ph=std::numeric_limits<float>::quiet_NaN();assert(!decodeSensor(reinterpret_cast<const uint8_t*>(&packet),12,out));
  assert(!decodeSensor(nullptr,12,out));
}
