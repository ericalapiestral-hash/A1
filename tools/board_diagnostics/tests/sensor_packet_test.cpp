#include "../../../A_board/SensorPacket.h"
#include <cassert>
#include <cstring>
#include <limits>
int main() {
  SensorData current{42.0f,3.12f,9.7f,0}, decoded{};
  bool legacy=true;
  assert(decodeSensorPacket(reinterpret_cast<uint8_t*>(&current),sizeof(current),decoded,legacy));
  assert(!legacy && decoded.ph==9.7f && decoded.waterLevel==0);
  struct Legacy {float unusedTemp; SensorData remaining;};
  Legacy old{std::numeric_limits<float>::quiet_NaN(),current};
  static_assert(sizeof(old)==20,"legacy layout");
  assert(decodeSensorPacket(reinterpret_cast<uint8_t*>(&old),sizeof(old),decoded,legacy));
  assert(legacy && decoded.lux==42.0f && decoded.turbidity==3.12f && decoded.ph==9.7f);
  SensorData saved=decoded;
  assert(!decodeSensorPacket(reinterpret_cast<uint8_t*>(&old),19,decoded,legacy));
  current.waterLevel=7;
  assert(!decodeSensorPacket(reinterpret_cast<uint8_t*>(&current),16,decoded,legacy));
  assert(std::memcmp(&saved,&decoded,16)==0);
  assert(!decodeSensorPacket(nullptr,16,decoded,legacy));
}
