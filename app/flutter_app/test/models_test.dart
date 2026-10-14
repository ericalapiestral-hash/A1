import 'package:aqua_control/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('이전 보드가 보낸 수온은 무시하고 센서 null 수신은 미수신으로 되돌린다', () {
    final state = AquariumState();
    state.applyJson({'temp': 25, 'tempSet': 26, 'ph': 7.2, 'level': 1});
    expect(state.receivedFields, isNot(contains('temp')));
    expect(state.receivedFields, isNot(contains('tempSet')));
    expect(state.receivedFields, contains('ph'));
    state.applyJson({'ph': null, 'level': null});
    expect(state.receivedFields, isNot(contains('ph')));
    expect(state.receivedFields, isNot(contains('level')));
  });

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
    expect(state.receivedFields, isNot(contains('temp')));
    expect(state.lux, 80);
    expect(state.circOn, 30);
    expect(state.heaterOn, isTrue);
    expect(state.pump1On, isFalse);
    expect(state.pump2On, isTrue);
    expect(state.receivedFields, containsAll(['lux', 'circOn', 'heaterOn']));
  });

  test('급수 출력 미설정 null은 이전 수신값과 원시 별칭으로 확정하지 않는다', () {
    final state = AquariumState();
    state.applyJson({'pump1Mode': 1, 'pump1On': true});
    expect(state.receivedFields, containsAll(['pump1Mode', 'pump1On']));
    state.applyJson({'pump1Mode': null, 'pump1On': null, 'sup': 1});
    expect(state.receivedFields, isNot(contains('pump1Mode')));
    expect(state.receivedFields, isNot(contains('pump1On')));
    state.applyJson({'pump1Mode': 0, 'pump1On': false});
    expect(state.receivedFields, containsAll(['pump1Mode', 'pump1On']));
    expect(state.pump1On, isFalse);
  });

  test('Aquarium의 실제 순환 신호는 LOW일 때 ON이며 다른 출력은 반전하지 않는다', () {
    final state = AquariumState();
    state.applyJson({'cir': 0, 'sup': 0, 'ht': 0}, aquariumCirActiveLow: true);
    expect(state.pump2On, isTrue);
    expect(state.pump1On, isFalse);
    expect(state.heaterOn, isFalse);
    state.applyJson({'cir': 1}, aquariumCirActiveLow: true);
    expect(state.pump2On, isFalse);
    state.applyJson({'cir': 'invalid'}, aquariumCirActiveLow: true);
    expect(state.pump2On, isFalse);
    state.applyJson({'cir': false}, aquariumCirActiveLow: true);
    expect(state.pump2On, isTrue);
  });

  test('명시적인 pump2On과 기존 AquaControl 상태는 Aquarium 극성 영향을 받지 않는다', () {
    final state = AquariumState();
    state.applyJson({'pump2On': true, 'cir': 1}, aquariumCirActiveLow: true);
    expect(state.pump2On, isTrue);
    state.applyJson({'pump2On': false, 'cir': 0}, aquariumCirActiveLow: true);
    expect(state.pump2On, isFalse);
    state.applyJson({'pump2On': true});
    expect(state.pump2On, isTrue);
    state.applyJson({'pump2On': false});
    expect(state.pump2On, isFalse);
  });
}
