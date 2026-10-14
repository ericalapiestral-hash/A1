#include "../../../B_board_Aquarium/ManualSupply.h"
#include <assert.h>
#include <initializer_list>
#include <limits>

using namespace aquarium;

static Result command(ManualSupply& supply, Circulation& circulation,
                      const char* text, uint32_t now) {
  Result result = applySupply(supply, text);
  return result == Result::Rejected ? apply(circulation, text, now) : result;
}

int main() {
  // An unconfigured template preserves the old HIGH output and cannot turn on.
  ManualSupply unconfigured;
  assert(unconfigured.mode == 0 && !unconfigured.configured());
  assert(!unconfigured.on() && unconfigured.level() == 1);
  assert(applySupply(unconfigured, "pump1Mode=1") == Result::Rejected);
  unconfigured.mode = 1;
  assert(!unconfigured.on() && unconfigured.level() == 1);
  assert(!unconfigured.on(true) && unconfigured.level(true) == 1);
  for (uint8_t invalid : {3, 255}) {
    unconfigured.polarity = invalid;
    assert(!unconfigured.configured() && !unconfigured.on());
    assert(unconfigured.level() == 1);
    assert(applySupply(unconfigured, "pump1Mode=0") == Result::Rejected);
  }

  for (uint8_t polarity : {1, 2}) {
    ManualSupply supply;
    Circulation circulation;
    supply.polarity = polarity;
    const uint8_t offLevel = polarity == 1 ? 1 : 0;
    const uint8_t onLevel = offLevel ^ 1;
    assert(supply.configured() && supply.mode == 0 && !supply.on());
    assert(supply.level() == offLevel);

    // The API accepts exactly OFF/ON. Whitespace framing is not a mode.
    assert(command(supply, circulation, " pump1Mode=1\r\n ", 0) == Result::Mode);
    assert(supply.mode == 1 && supply.on() && supply.level() == onLevel);
    assert(circulation.mode == 0);
    for (const char* invalid : {"", " ", "pump1Mode=2", "pump1Mode=-1",
                               "pump1Mode=+1", "pump1Mode=01", "pump1Mode=00",
                               "pump1Mode=1x", "pump1Mode=1\npump1Mode=0",
                               "pump1Mode= 1", "pump1Mode =1", "Pump1Mode=1",
                               "supplyOn=1", "supOn=1", "S10/60", "M1"}) {
      assert(command(supply, circulation, invalid, 0) == Result::Rejected);
      assert(supply.mode == 1 && supply.polarity == polarity);
      assert(supply.on() && supply.level() == onLevel);
      assert(circulation.mode == 0);
    }
    assert(applySupply(supply, nullptr) == Result::Rejected);

    // A water-level packet and circulation phase transitions do not drive supply.
    assert(command(supply, circulation, "pump2Mode=2", 0) == Result::Mode);
    SensorPacket packet{9.7f, 3.118f, 1, {0}}, decoded{};
    for (uint8_t waterLow : {0, 1}) {
      packet.waterLow = waterLow;
      assert(decodeSensor(reinterpret_cast<const uint8_t*>(&packet), 12, decoded));
      for (uint32_t now : {0U, 120000U, 180000U, 86400000U,
                           std::numeric_limits<uint32_t>::max()}) {
        circulation.step(now);
        assert(supply.on(circulation.emergency));
        assert(supply.level(circulation.emergency) == onLevel);
      }
    }

    // Emergency inhibits both outputs, including a new ON request while stopped.
    assert(command(supply, circulation, "E1", 1) == Result::Emergency);
    assert(!circulation.on() && !supply.on(circulation.emergency));
    assert(supply.level(circulation.emergency) == offLevel);
    assert(command(supply, circulation, "pump1Mode=1", 2) == Result::Mode);
    assert(!supply.on(circulation.emergency));
    assert(supply.level(circulation.emergency) == offLevel);
    assert(command(supply, circulation, "pump1Mode=0\n", 3) == Result::Mode);
    assert(command(supply, circulation, "E0", 4) == Result::Emergency);
    assert(!supply.on() && supply.level() == offLevel);

    // Manual OFF stays OFF regardless of circulation timers or sensor state.
    for (uint32_t now : {5U, 120005U, 180005U, 86400000U}) {
      circulation.step(now);
      assert(!supply.on() && supply.level() == offLevel);
    }
    assert(command(supply, circulation, "pump1Mode=1", 6) == Result::Mode);
    assert(supply.on() && supply.level() == onLevel);
    // Reconstructing controller state on reset never restores a previous ON.
    ManualSupply reboot;
    reboot.polarity = polarity;
    assert(!reboot.on() && reboot.level() == offLevel);
  }
}
