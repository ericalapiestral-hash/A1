import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'models.dart';
import 'ble_manager.dart';

/// 연결 방식: 데모 / 블루투스(BLE)
enum ConnMode { demo, ble }

class AquaApi extends ChangeNotifier {
  ConnMode mode;
  final AquariumState state = AquariumState();
  final BleManager ble = BleManager();
  final List<double> tempHistory = [];

  Timer? _timer;
  final Random _rng = Random();
  double _t = 24.5;
  // 데모용 순환 타이머 시뮬레이션
  int _circSec = 0;
  bool _circPhaseOn = true;

  AquaApi({this.mode = ConnMode.demo}) {
    ble.onStatus = (j) {
      try {
        state.applyJson(jsonDecode(j) as Map<String, dynamic>);
        state.connected = true;
        _pushHistory();
        notifyListeners();
      } catch (_) {}
    };
    ble.onConnection = (c) {
      state.connected = c;
      notifyListeners();
    };
  }

  bool get isDemo => mode == ConnMode.demo;

  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) => refresh());
    refresh();
  }

  @override
  void dispose() {
    _timer?.cancel();
    ble.disconnect();
    super.dispose();
  }

  Future<void> refresh() async {
    switch (mode) {
      case ConnMode.demo:
        _simulate();
        state.connected = false;
        break;
      case ConnMode.ble:
        // BLE는 알림(push)으로 상태가 들어오므로 폴링하지 않음
        break;
    }
    _pushHistory();
    notifyListeners();
  }

  Future<void> setValue(String key, num value) async {
    state.applyControlKey(key, value);
    notifyListeners();
    switch (mode) {
      case ConnMode.demo:
        _applyDemoControl();
        notifyListeners();
        break;
      case ConnMode.ble:
        await ble.write('$key=$value');
        break;
    }
  }

  Future<void> setMode(ConnMode m) async {
    mode = m;
    state.connected = false;
    if (m == ConnMode.ble) {
      await ble.connect();
    } else {
      await ble.disconnect();
    }
    notifyListeners();
    refresh();
  }

  void _pushHistory() {
    tempHistory.add(state.temp);
    if (tempHistory.length > 40) tempHistory.removeAt(0);
  }

  // ---------------- 데모 시뮬레이션 ----------------
  void _simulate() {
    _t += (_rng.nextDouble() - 0.5) * 0.2;
    if (state.heaterOn) {
      _t += 0.06;
    } else {
      _t -= 0.04;
    }
    _t = _t.clamp(20.0, 30.0);
    state.temp = _t;
    state.ph = 7.0 + (_rng.nextDouble() - 0.5) * 0.3;
    state.turb = 8 + _rng.nextDouble() * 10;
    state.lux = 40 + _rng.nextDouble() * 45;
    if (_rng.nextDouble() < 0.015) state.level = 1 - state.level;
    // 순환 타이머 주기 시뮬레이션 (켜짐 circOn분 / 꺼짐 circOff분)
    _circSec += 2;
    if (_circPhaseOn && _circSec >= state.circOn * 60) {
      _circPhaseOn = false;
      _circSec = 0;
    } else if (!_circPhaseOn && _circSec >= state.circOff * 60) {
      _circPhaseOn = true;
      _circSec = 0;
    }
    _applyDemoControl();
  }

  void _applyDemoControl() {
    if (state.heaterMode == 1) {
      state.heaterOn = true;
    } else if (state.heaterMode == 0) {
      state.heaterOn = false;
    } else {
      state.heaterOn = state.temp < state.tempSet;
    }
    if (state.oxygenMode == 1) {
      state.oxygenOn = true;
    } else if (state.oxygenMode == 0) {
      state.oxygenOn = false;
    } else {
      state.oxygenOn = state.level == 1;
    }
    if (state.pump1Mode == 1) {
      state.pump1On = true;
    } else if (state.pump1Mode == 0) {
      state.pump1On = false;
    } else {
      state.pump1On = state.level == 0;
    }
    if (state.pump2Mode == 1) {
      state.pump2On = true;
    } else if (state.pump2Mode == 0) {
      state.pump2On = false;
    } else {
      state.pump2On = _circPhaseOn; // 순환 타이머 주기
    }
  }
}
