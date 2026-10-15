#include "../../../B_board_Aquarium/ManualHeater.h"
#include "../../../B_board_Aquarium/ManualSupply.h"
#include <assert.h>
#include <initializer_list>
using namespace aquarium;
int main(){
  ManualHeater locked;
  assert(!locked.configured() && !locked.on() && locked.level()==1);
  for(const char* command:{"heaterMode=0","heaterMode=1","heaterMode=2","check18=0"})
    assert(applyHeater(locked,command,0,true)==HeaterResult::Rejected);
  assert(applyHeater(locked,"check18=0",0,false,true)==HeaterResult::Check);
  assert(locked.checking && locked.level()==0 && !locked.on());
  locked.step(4999);assert(locked.checking && locked.level()==0);
  locked.step(5000);assert(!locked.checking && locked.level()==1 && locked.mode==0);
  assert(applyHeater(locked,"check18=1\n",0xfffffff0,false,true)==HeaterResult::Check);
  locked.step(uint32_t(0xfffffff0U+5000U));assert(!locked.checking);
  assert(applyHeater(locked,"check18=0",0,false,true)==HeaterResult::Check);
  assert(applyHeater(locked,"check18=stop",1,false,true)==HeaterResult::Check);
  assert(!locked.checking && locked.level()==1);
  for(uint8_t polarity:{1,2}){
    ManualHeater heater;heater.polarity=polarity;
    const uint8_t off=polarity==1?1:0,on=off^1;
    assert(heater.configured() && !heater.on() && heater.level()==off);
    assert(applyHeater(heater,"heaterMode=1",0,false)==HeaterResult::Rejected);
    assert(!heater.on() && heater.level()==off);
    assert(applyHeater(heater," heaterMode=1\r\n ",0,true)==HeaterResult::Mode);
    assert(heater.on() && heater.level()==on);
    for(const char* command:{"heaterMode=2","heaterMode=-1","heaterMode=01","heaterMode=1x","H","tempSet=25","check18=0","heaterMode= 1"}){
      assert(applyHeater(heater,command,0,true,true)==HeaterResult::Rejected);
      assert(heater.mode==1 && heater.on() && heater.level()==on);
    }
    assert(applyHeater(heater,nullptr,0,true)==HeaterResult::Rejected);
    for(uint32_t now:{120000U,180000U,86400000U,0xffffffffU}){heater.step(now);assert(heater.on());}
    assert(applyHeater(heater,"heaterMode=0",0,false)==HeaterResult::Mode);
    assert(!heater.on() && heater.level()==off);
    assert(applyHeater(heater,"heaterMode=1",1,true)==HeaterResult::Mode);
    heater.stop(); // BLE disconnect / E1 clears the requested ON, not just the output.
    assert(heater.mode==0 && !heater.on() && heater.level()==off);
    heater.step(999999);assert(!heater.on());
    Circulation circulation;ManualSupply supply;supply.polarity=2;
    apply(circulation,"pump2Mode=2",0);applySupply(supply,"pump1Mode=1");
    heater.stop();circulation.step(120000);
    assert(!heater.on() && supply.on() && circulation.mode==2);
    ManualHeater reboot;reboot.polarity=polarity;assert(reboot.mode==0 && reboot.level()==off);
  }
}
