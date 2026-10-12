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
  final BleManager ble;
  bool connecting = false;
  String? connectionError;
  String connectionMessage = '';
  int _modeRequest = 0;
  bool _disposed = false;
  final List<double> tempHistory = [];

  Timer? _timer;
  final Random _rng = Random();
  double _t = 24.5;
  // 데모용 순환 타이머 시뮬레이션
  int _circSec = 0;
  bool _circPhaseOn = true;

  AquaApi({this.mode = ConnMode.demo, BleManager? bleManager})
      : ble = bleManager ?? BleManager() {
    ble.onStatus = (j) {
      if (mode != ConnMode.ble) return;
      try {
        state.applyJson(jsonDecode(j) as Map<String, dynamic>);
        _pushHistory();
        notifyListeners();
      } catch (_) {}
    };
    ble.onConnection = (c) {
      if (mode != ConnMode.ble) return;
      state.connected = c;
      connectionMessage = c ? '블루투스 연결됨' : '연결이 끊겼습니다. 다시 검색해 주세요.';
      notifyListeners();
    };
    ble.onProgress = (message) {
      if (mode != ConnMode.ble) return;
      connectionMessage = message;
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
    _disposed = true;
    _timer?.cancel();
    ++_modeRequest;
    ble.onStatus = null;
    ble.onConnection = null;
    ble.onProgress = null;
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
    if (_disposed) return;
    final request = _modeRequest;
    if (mode == ConnMode.ble) {
      try {
        await ble.write('$key=$value');
        if (_disposed || request != _modeRequest) return;
        connectionError = null;
      } catch (error) {
        if (_disposed || request != _modeRequest) return;
        connectionError = '명령을 보내지 못했습니다. $error';
        notifyListeners();
        return;
      }
    }
    state.applyControlKey(key, value);
    notifyListeners();
    switch (mode) {
      case ConnMode.demo:
        _applyDemoControl();
        notifyListeners();
        break;
      case ConnMode.ble:
        break;
    }
  }

  Future<void> setMode(ConnMode m) async {
    final request = ++_modeRequest;
    mode = m;
    state.connected = false;
    connecting = m == ConnMode.ble;
    connectionError = null;
    connectionMessage = connecting ? '블루투스 연결을 준비합니다.' : '';
    notifyListeners();
    try {
      if (m == ConnMode.ble) {
        await ble.connect();
      } else {
        await ble.disconnect();
      }
    } catch (error) {
      if (request != _modeRequest) return;
      state.connected = false;
      connectionError = _connectionErrorMessage(error);
    }
    if (request != _modeRequest) return;
    connecting = false;
    notifyListeners();
    await refresh();
  }

  static String _connectionErrorMessage(Object error) {
    if (error is TimeoutException) {
      return '검색 또는 연결 시간이 초과되었습니다. B보드 전원과 거리를 확인한 뒤 다시 검색해 주세요.';
    }
    final message = error.toString();
    if (message.toLowerCase().contains('permission')) {
      return '앱 설정에서 근처 기기 권한을 허용해 주세요. Android 11 이하는 위치 권한도 필요합니다.';
    }
    if (message.toLowerCase().contains('location')) {
      return '휴대폰의 위치 기능을 켠 뒤 다시 검색해 주세요. Android 11 이하에서 필요합니다.';
    }
    return message.replaceFirst('Bad state: ', '');
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
