/// 수조 시스템의 전체 상태 (센서값 + 장치 모드/설정 + 작동 여부)
/// B보드가 보내는 JSON과 1:1로 매핑된다.
class AquariumState {
  // 센서값
  double ph = 7.1; // pH
  double turb = 10; // 탁도 NTU
  double lux = 60; // 조도 %
  int level = 1; // 수위 1=정상 0=부족

  // 장치 모드: 0=끄기, 1=켜기, 2=자동(순환·산소만)
  int heaterMode = 0; // 수온 센서 없음: OFF/수동 ON만 지원
  int oxygenMode = 2;
  int pump1Mode = 0; // 급수는 수동 끄기/켜기만 지원
  int pump2Mode = 2;

  // 설정값
  int oxyOn = 15; // 산소 자동 ON(분)
  int oxyOff = 15; // 산소 자동 OFF(분)
  int circOn = 5; // 순환 자동 ON(분)
  int circOff = 25; // 순환 자동 OFF(분)

  // 실제 작동 여부 (B보드가 계산해서 알려줌)
  bool heaterOn = false;
  bool oxygenOn = false;
  bool pump1On = false;
  bool pump2On = false;

  bool connected = false; // 앱↔B보드 연결 상태
  final Set<String> receivedFields = {};

  /// B보드 /status JSON 반영
  void applyJson(Map<String, dynamic> j, {bool aquariumCirActiveLow = false}) {
    receivedFields.removeWhere((key) => j.containsKey(key) && j[key] == null);
    ph = _d(j['ph'], ph);
    turb = _d(j['turb'], turb);
    lux = _d(j['lux'], lux);
    level = _i(j['level'], level);
    if (j['level'] is! num) {
      final low = _flag(j['water_low']);
      if (low != null) {
        level = low ? 0 : 1;
        receivedFields.add('level');
      }
    }
    heaterMode = _i(j['heaterMode'], heaterMode);
    oxygenMode = _i(j['oxygenMode'], oxygenMode);
    pump1Mode = _i(j['pump1Mode'], pump1Mode);
    pump2Mode = _i(j['pump2Mode'], pump2Mode);
    oxyOn = _i(j['oxyOn'], oxyOn);
    oxyOff = _i(j['oxyOff'], oxyOff);
    circOn = _i(j['circOn'], circOn);
    circOff = _i(j['circOff'], circOff);
    for (final key in [
      'ph',
      'turb',
      'lux',
      'level',
      'heaterMode',
      'oxygenMode',
      'pump1Mode',
      'pump2Mode',
      'oxyOn',
      'oxyOff',
      'circOn',
      'circOff',
    ]) {
      if (j[key] is num) receivedFields.add(key);
    }
    void flag(String key, dynamic value, void Function(bool) assign) {
      // 명시적인 null은 출력 미확인이다. 이전 상태나 별칭으로 확정하지 않는다.
      if (j.containsKey(key) && j[key] == null) return;
      final parsed = _flag(value);
      if (parsed == null) return;
      assign(parsed);
      receivedFields.add(key);
    }

    flag('heaterOn', j['heaterOn'] ?? j['ht'], (v) => heaterOn = v);
    flag('oxygenOn', j['oxygenOn'], (v) => oxygenOn = v);
    flag('pump1On', j['pump1On'] ?? j['sup'], (v) => pump1On = v);
    final canonicalCirculation = _flag(j['pump2On']);
    final aquariumCirculation = _flag(j['cir']);
    flag(
        'pump2On',
        canonicalCirculation ??
            (aquariumCirculation == null
                ? null
                : aquariumCirActiveLow
                    ? !aquariumCirculation
                    : aquariumCirculation),
        (v) => pump2On = v);
  }

  /// 화면에서 값을 바꿀 때 로컬 상태에 즉시 반영(낙관적 업데이트)
  void applyControlKey(String key, num v) {
    switch (key) {
      case 'heaterMode':
        heaterMode = v.toInt();
        break;
      case 'oxygenMode':
        oxygenMode = v.toInt();
        break;
      case 'pump1Mode':
        pump1Mode = v.toInt();
        break;
      case 'pump2Mode':
        pump2Mode = v.toInt();
        break;
      case 'oxyOn':
        oxyOn = v.toInt();
        break;
      case 'oxyOff':
        oxyOff = v.toInt();
        break;
      case 'circOn':
        circOn = v.toInt();
        break;
      case 'circOff':
        circOff = v.toInt();
        break;
    }
  }

  static double _d(dynamic v, double fb) => v is num ? v.toDouble() : fb;
  static int _i(dynamic v, int fb) => v is num ? v.toInt() : fb;
  static bool? _flag(dynamic v) {
    if (v is bool) return v;
    if (v == 0) return false;
    if (v == 1) return true;
    return null;
  }
}
