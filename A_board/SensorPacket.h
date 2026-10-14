#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

// 수온이 없는 현재 패킷. A/B의 헤더는 동일하게 유지합니다.
struct SensorData {
  float lux;
  float turbidity;
  float ph;
  int32_t waterLevel;
};
static_assert(sizeof(SensorData) == 16, "Unexpected sensor packet layout");

// 기존 A보드의 20바이트 패킷도 수신하되 첫 수온 필드는 사용하지 않습니다.
inline bool decodeSensorPacket(const uint8_t* bytes, size_t length,
                               SensorData& output, bool& legacy) {
  if (!bytes || (length != 16 && length != 20)) return false;
  SensorData candidate;
  const bool isLegacy = length == 20;
  memcpy(&candidate, bytes + (isLegacy ? 4 : 0), sizeof(candidate));
  if (candidate.waterLevel != 0 && candidate.waterLevel != 1) return false;
  output = candidate;
  legacy = isLegacy;
  return true;
}
