import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'models.dart';
import 'ble_manager.dart';

/// 연결 방식: 데모 / 블루투스(BLE)
enum ConnMode { demo, ble }

enum _ControlPhase { sending, waiting, confirmed, unconfirmed, failed }

class _ControlRequest {
  final num value;
  final int startRevision;
  _ControlPhase phase = _ControlPhase.sending;
  String? error;
  Timer? timer;
  _ControlRequest(this.value, this.startRevision);
}

class AquaApi extends ChangeNotifier {
  ConnMode mode;
  final AquariumState state = AquariumState();
  final BleManager ble;
  final Duration controlConfirmTimeout;
  bool connecting = false;
  String? connectionError;
  String connectionMessage = '';
  int _modeRequest = 0;
  bool _disposed = false;
  final Map<String, _ControlRequest> _controls = {};
  Map<String, dynamic> _lastStatus = {};
  int _statusRevision = 0;

  Timer? _timer;
  final Random _rng = Random();
  // 데모용 순환 타이머 시뮬레이션
  int _circSec = 0;
  bool _circPhaseOn = true;

  AquaApi({
    this.mode = ConnMode.demo,
    BleManager? bleManager,
    this.controlConfirmTimeout = const Duration(seconds: 5),
  }) : ble = bleManager ?? BleManager() {
    ble.onStatus = (j) {
      if (mode != ConnMode.ble) return;
      try {
        _lastStatus = jsonDecode(j) as Map<String, dynamic>;
        _statusRevision++;
        state.applyJson(_lastStatus,
            aquariumCirActiveLow: ble.isAquariumProfile);
        _confirmControls();
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
  bool hasValue(String key) =>
      key != 'temp' &&
      key != 'tempSet' &&
      (isDemo || state.receivedFields.contains(key));
  bool get isAquariumProfile => mode == ConnMode.ble && ble.isAquariumProfile;
  bool get manualSupplyAvailable =>
      !isAquariumProfile || _lastStatus['manualSupplySupported'] == true;
  String get connectionDiagnostics =>
      ble.diagnostics +
      (_controls.isEmpty
          ? ''
          : '\n제어 요청 진단:\n${_controls.entries.map((e) => '${e.key}=${e.value.value}: ${controlFeedback(e.key)}').join('\n')}');

  num controlValue(String key, num boardValue) {
    final request = _controls[key];
    return request != null && request.phase != _ControlPhase.confirmed
        ? request.value
        : boardValue;
  }

  int? controlMode(String key, int boardValue) {
    final request = _controls[key];
    if (request != null && request.phase != _ControlPhase.confirmed) {
      return request.value.toInt();
    }
    return hasValue(key) ? boardValue : null;
  }

  String controlFeedback(String key) {
    final request = _controls[key];
    if (request == null) return hasValue(key) ? '보드 설정값' : '입력값 · 보드 설정 미수신';
    switch (request.phase) {
      case _ControlPhase.sending:
        return '전송 중…';
      case _ControlPhase.waiting:
        return '전송됨 · 보드 설정값 확인 대기';
      case _ControlPhase.confirmed:
        return '보드 설정값 확인됨';
      case _ControlPhase.unconfirmed:
        return '전송됐지만 보드 적용 미확인';
      case _ControlPhase.failed:
        return '전송 실패: ${request.error}';
    }
  }

  void _confirmControls() {
    for (final entry in _controls.entries) {
      final request = entry.value;
      if ((request.phase == _ControlPhase.waiting ||
              request.phase == _ControlPhase.unconfirmed) &&
          _statusRevision > request.startRevision &&
          _lastStatus[entry.key] is num &&
          _lastStatus[entry.key] == request.value) {
        request.phase = _ControlPhase.confirmed;
        request.timer?.cancel();
      }
    }
  }

  void _clearControls() {
    for (final request in _controls.values) {
      request.timer?.cancel();
    }
    _controls.clear();
    _lastStatus = {};
  }

  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) => refresh());
    refresh();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _clearControls();
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
    notifyListeners();
  }

  Future<void> setValue(String key, num value) async {
    if (_disposed) return;
    if (key == 'pump1Mode' &&
        ((value != 0 && value != 1) || !manualSupplyAvailable)) {
      connectionError = !manualSupplyAvailable
          ? '급수 수동 제어를 지원하는 B보드 v1.1.0과 급수 출력 설정이 필요합니다.'
          : '급수는 수동 끄기·켜기만 사용할 수 있습니다.';
      notifyListeners();
      return;
    }
    if (key == 'tempSet' || (key == 'heaterMode' && value != 0 && value != 1)) {
      connectionError = '수온 센서가 제거되어 목표 수온과 히터 자동 모드는 사용할 수 없습니다.';
      notifyListeners();
      return;
    }
    final request = _modeRequest;
    if (mode == ConnMode.ble) {
      _controls[key]?.timer?.cancel();
      final control = _ControlRequest(value, _statusRevision);
      _controls[key] = control;
      notifyListeners();
      try {
        await ble.write('$key=$value');
        if (_disposed || request != _modeRequest || _controls[key] != control)
          return;
        control.phase = _ControlPhase.waiting;
        _confirmControls();
        if (control.phase != _ControlPhase.confirmed) {
          control.timer = Timer(controlConfirmTimeout, () {
            if (_disposed ||
                request != _modeRequest ||
                _controls[key] != control) return;
            control.phase = _ControlPhase.unconfirmed;
            notifyListeners();
          });
        }
        connectionError = null;
        notifyListeners();
      } catch (error) {
        if (_disposed || request != _modeRequest || _controls[key] != control)
          return;
        control.phase = _ControlPhase.failed;
        control.error = error.toString();
        connectionError = '명령을 보내지 못했습니다. $error';
        notifyListeners();
      }
      // BLE 쓰기 ACK는 명령 적용의 증거가 아니다. 실제 상태는 보드 수신값만 반영.
      return;
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
    _clearControls();
    state.receivedFields.clear();
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

  // ---------------- 데모 시뮬레이션 ----------------
  void _simulate() {
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
    state.heaterOn = state.heaterMode == 1;
    if (state.oxygenMode == 1) {
      state.oxygenOn = true;
    } else if (state.oxygenMode == 0) {
      state.oxygenOn = false;
    } else {
      state.oxygenOn = state.level == 1;
    }
    state.pump1On = state.pump1Mode == 1;
    if (state.pump2Mode == 1) {
      state.pump2On = true;
    } else if (state.pump2Mode == 0) {
      state.pump2On = false;
    } else {
      state.pump2On = _circPhaseOn; // 순환 타이머 주기
    }
  }
}
