/// 수조 시스템의 전체 상태 (센서값 + 장치 모드/설정 + 작동 여부)
/// B보드가 보내는 JSON과 1:1로 매핑된다.
class AquariumState {
  // 센서값
  double temp = 24.8; // 수온 ℃
  double ph = 7.1; // pH
  double turb = 10; // 탁도 NTU
  double lux = 60; // 조도 %
  int level = 1; // 수위 1=정상 0=부족

  // 장치 모드: 0=끄기, 1=켜기, 2=자동
  int heaterMode = 2;
  int oxygenMode = 2;
  int pump1Mode = 2;
  int pump2Mode = 2;

  // 설정값
  double tempSet = 25.0; // 목표 수온
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

  /// B보드 /status JSON 반영
  void applyJson(Map<String, dynamic> j) {
    temp = _d(j['temp'], temp);
    ph = _d(j['ph'], ph);
    turb = _d(j['turb'], turb);
    lux = _d(j['lux'], lux);
    level = _i(j['level'], level);
    heaterMode = _i(j['heaterMode'], heaterMode);
    oxygenMode = _i(j['oxygenMode'], oxygenMode);
    pump1Mode = _i(j['pump1Mode'], pump1Mode);
    pump2Mode = _i(j['pump2Mode'], pump2Mode);
    tempSet = _d(j['tempSet'], tempSet);
    oxyOn = _i(j['oxyOn'], oxyOn);
    oxyOff = _i(j['oxyOff'], oxyOff);
    circOn = _i(j['circOn'], circOn);
    circOff = _i(j['circOff'], circOff);
    heaterOn = j['heaterOn'] ?? heaterOn;
    oxygenOn = j['oxygenOn'] ?? oxygenOn;
    pump1On = j['pump1On'] ?? pump1On;
    pump2On = j['pump2On'] ?? pump2On;
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
      case 'tempSet':
        tempSet = v.toDouble();
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

  static double _d(dynamic v, double fb) => v == null ? fb : (v as num).toDouble();
  static int _i(dynamic v, int fb) => v == null ? fb : (v as num).toInt();
}
