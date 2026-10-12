import 'package:aqua_control/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Aquarium 수신값을 반영하고 없는 센서·단위 미확인 타이머는 실측으로 표시하지 않는다', () {
    final state = AquariumState();
    state.applyJson({
      'online': 1,
      'ph': 9.70,
      'turb': 3.12,
      'water_low': 1,
      'sup': 0,
      'cir': 0,
      'ht': 0,
      'con': 60,
      'cof': 120,
      'son': 10,
      'sof': 60,
      'smode': 0,
      'estop': 0,
    });
    expect(state.ph, 9.70);
    expect(state.turb, 3.12);
    expect(state.level, 0);
    expect(state.receivedFields,
        containsAll(['ph', 'turb', 'level', 'pump1On', 'pump2On', 'heaterOn']));
    expect(state.receivedFields, isNot(contains('temp')));
    expect(state.receivedFields, isNot(contains('lux')));
    expect(state.receivedFields, isNot(contains('circOn')));
    expect(state.receivedFields, isNot(contains('oxyOn')));
    state.applyJson({'water_low': 0, 'sup': 1, 'cir': true, 'ht': 1});
    expect(state.level, 1);
    expect(state.pump1On, isTrue);
    expect(state.pump2On, isTrue);
    expect(state.heaterOn, isTrue);
  });

  test('기존 AquaControl 센서·설정·bool 상태를 계속 지원한다', () {
    final state = AquariumState();
    state.applyJson({
      'temp': 26.5,
      'ph': 7.2,
      'lux': 80,
      'level': 1,
      'circOn': 30,
      'heaterOn': true,
      'pump1On': false,
      'pump2On': true
    });
    expect(state.temp, 26.5);
    expect(state.lux, 80);
    expect(state.circOn, 30);
    expect(state.heaterOn, isTrue);
    expect(state.pump1On, isFalse);
    expect(state.pump2On, isTrue);
    expect(state.receivedFields,
        containsAll(['temp', 'lux', 'circOn', 'heaterOn']));
  });
}
