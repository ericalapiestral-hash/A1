import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

/// B보드(ESP32)와 BLE로 통신. 서비스 UUID는 펌웨어와 동일해야 함.
class BleManager {
  static const String deviceName = 'AquaControl';
  static const Set<String> deviceNames = {'aquacontrol', 'aquarium'};
  static final Guid svcUuid = Guid('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
  static final Guid cmdUuid = Guid('6e400002-b5a3-f393-e0a9-e50e24dcca9e');
  static final Guid statusUuid = Guid('6e400003-b5a3-f393-e0a9-e50e24dcca9e');
  // 실제 Aquarium 보드에서 확인된 구성: 상태 ...02, 명령 ...03.
  static final Guid aquariumSvcUuid =
      Guid('4f7f1234-1234-5678-1234-aaaa00000001');
  static final Guid aquariumStatusUuid =
      Guid('4f7f1234-1234-5678-1234-aaaa00000002');
  static final Guid aquariumCmdUuid =
      Guid('4f7f1234-1234-5678-1234-aaaa00000003');

  final Duration scanTimeout;
  final Duration serviceRetryDelay;
  final Future<int> Function(BluetoothDevice) _negotiateMtu;
  BleManager({
    this.scanTimeout = const Duration(seconds: 15),
    this.serviceRetryDelay = const Duration(milliseconds: 600),
    Future<int> Function(BluetoothDevice)? negotiateMtu,
  }) : _negotiateMtu = negotiateMtu ?? _nativeMtu;

  static Future<int> _nativeMtu(BluetoothDevice device) async {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return device.requestMtu(512, timeout: 5);
    }
    return device.mtuNow;
  }

  void Function(String json)? onStatus;
  void Function(bool connected)? onConnection;
  void Function(String message)? onProgress;

  BluetoothDevice? _device;
  BluetoothCharacteristic? _cmd;
  StreamSubscription? _scanSub, _statusSub, _connSub;
  Completer<BluetoothDevice?>? _scanResult;
  Future<void> _operation = Future<void>.value();
  int _session = 0;
  bool _ready = false;
  final List<int> _rxBuf = [];
  final List<String> _statusSamples = [];
  int _sampleBytes = 0, _packets = 0, _validFrames = 0, _discardedFrames = 0;
  int _maxPacketSize = 0;
  String _lastJson = '';
  String? _profileName;
  int _jsonDepth = 0;
  int? _lastSyntaxByte;
  bool _inJsonString = false, _jsonEscaped = false;
  String _diagnostics = '';

  bool get isAquariumProfile => _profileName == 'Aquarium';

  String get diagnostics => _diagnostics.isEmpty
      ? ''
      : '$_diagnostics\n수신 패킷: $_packets개, 최대 $_maxPacketSize바이트\n'
          '완전한 JSON: $_validFrames개, 폐기한 메시지: $_discardedFrames개\n'
          '${_lastJson.isEmpty ? '' : '마지막 완전한 JSON:\n$_lastJson\n'}'
          '${_statusSamples.isEmpty ? '' : '수신 예시 (원문 최대 1024바이트):\n${_statusSamples.join('\n')}'}';

  static bool matchesDevice(ScanResult result) =>
      deviceNames
          .contains(result.advertisementData.advName.trim().toLowerCase()) ||
      deviceNames.contains(result.device.platformName.trim().toLowerCase());

  // 재검색/모드 전환은 이전 작업을 취소하고, 정리가 끝난 뒤 순서대로 실행.
  Future<void> _enqueue(Future<void> Function() action) {
    final next = _operation.then((_) => action());
    _operation = next.catchError((Object _) {});
    return next;
  }

  void _cancelSearch() {
    final result = _scanResult;
    if (result != null && !result.isCompleted) result.complete(null);
  }

  Future<void> connect() {
    final session = ++_session;
    _cancelSearch();
    return _enqueue(() async {
      await _cleanup();
      if (session != _session) return;
      _diagnostics = '';
      _statusSamples.clear();
      _sampleBytes = _packets = _validFrames = _discardedFrames = 0;
      _maxPacketSize = 0;
      _lastJson = '';
      _profileName = null;
      try {
        onProgress?.call('블루투스 상태를 확인합니다.');
        if (!await FlutterBluePlus.isSupported) {
          throw StateError('이 기기는 BLE를 지원하지 않습니다.');
        }
        if (session != _session) return;
        final adapter = await FlutterBluePlus.adapterState
            .where((s) => s != BluetoothAdapterState.unknown)
            .first
            .timeout(const Duration(seconds: 5));
        if (session != _session) return;
        if (adapter != BluetoothAdapterState.on) {
          throw StateError('휴대폰의 블루투스를 켠 뒤 다시 검색해 주세요.');
        }

        onProgress?.call('Aquarium / AquaControl을 검색합니다.');
        // 서비스 UUID를 광고하지 않는 기존 펌웨어도 이름으로 찾는다.
        await FlutterBluePlus.startScan(timeout: scanTimeout);
        if (session != _session) {
          await FlutterBluePlus.stopScan();
          return;
        }
        final found = Completer<BluetoothDevice?>();
        _scanResult = found;
        _scanSub = FlutterBluePlus.onScanResults.listen((results) {
          if (found.isCompleted) return;
          for (final result in results) {
            if (matchesDevice(result)) {
              found.complete(result.device);
              break;
            }
          }
        }, onError: (Object error, StackTrace stack) {
          if (!found.isCompleted) found.completeError(error, stack);
        });
        BluetoothDevice? device;
        try {
          device = await found.future.timeout(scanTimeout);
        } finally {
          _scanResult = null;
          await _scanSub?.cancel();
          _scanSub = null;
          await FlutterBluePlus.stopScan();
        }
        if (session != _session || device == null) return;
        await _setup(device, session);
      } catch (error) {
        if (session == _session && _diagnostics.isNotEmpty) {
          _diagnostics += '\n오류: $error';
        }
        await _cleanup();
        if (session == _session) rethrow;
      }
    });
  }

  Future<void> _setup(BluetoothDevice device, int session) async {
    _device = device;
    onProgress?.call('수조 기기에 연결합니다.');
    _connSub = device.connectionState.listen((state) {
      if (session != _session) return;
      if (state == BluetoothConnectionState.disconnected && _ready) {
        _ready = false;
        _cmd = null;
        _resetFrame();
        onConnection?.call(false);
      }
    });
    // 서비스 확인 후 Aquarium에 필요한 MTU를 협상한다.
    await device.connect(timeout: const Duration(seconds: 12), mtu: null);
    if (session != _session) return;
    onProgress?.call('수조 제어 서비스를 확인합니다.');
    _diagnostics = 'AquaControl BLE 연결 진단\n'
        '기기: ${device.platformName} (${device.remoteId})\n'
        '앱 서비스: $svcUuid\n'
        '명령 쓰기: $cmdUuid\n'
        '상태 알림: $statusUuid\n'
        'Aquarium 서비스: $aquariumSvcUuid\n'
        'Aquarium 명령 쓰기: $aquariumCmdUuid\n'
        'Aquarium 상태 알림: $aquariumStatusUuid\n';
    var services = await device.discoverServices();
    if (session != _session) return;
    _recordServices(services, '첫 서비스 검색');
    var profile = _resolveProfile(services);
    if (profile == null) {
      // 앱을 재설치해도 Android의 BLE 서비스 캐시는 남을 수 있다.
      onProgress?.call('블루투스 서비스 목록을 새로 확인합니다.');
      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
        try {
          await device.clearGattCache();
          _diagnostics += '\nAndroid 서비스 캐시 갱신 요청 완료\n';
        } catch (error) {
          // 지원하지 않는 OS에서도 서비스 재검색은 한 번 시도한다.
          _diagnostics += '\nAndroid 서비스 캐시 갱신 불가: $error\n';
        }
      }
      if (session != _session) return;
      await Future<void>.delayed(serviceRetryDelay);
      if (session != _session) return;
      services = await device.discoverServices();
      if (session != _session) return;
      _recordServices(services, '서비스 재검색');
      profile = _resolveProfile(services);
    }
    if (profile == null) {
      throw StateError(_profileError(services));
    }
    final status = profile.status;
    _profileName = profile.name;
    _cmd = profile.command;
    _diagnostics += '\n사용 구성: ${profile.name}\n'
        '사용 서비스: ${status.serviceUuid}\n'
        '사용 명령 쓰기: ${profile.command.uuid}\n'
        '사용 상태 알림: ${status.uuid}\n';
    if (isAquariumProfile) {
      onProgress?.call('센서 데이터 전송 크기를 맞춥니다.');
      try {
        final mtu = await _negotiateMtu(device);
        if (session != _session) return;
        _diagnostics += '협상 MTU: $mtu\n';
      } catch (error) {
        if (session != _session) return;
        _diagnostics += 'MTU 협상 실패 (현재 ${device.mtuNow}): $error\n';
      }
    } else {
      _diagnostics += '연결 MTU: ${device.mtuNow}\n';
    }
    if (session != _session) return;
    if (!device.isConnected) throw StateError('전송 설정 중 블루투스 연결이 끊겼습니다.');
    if (status.properties.read) {
      onProgress?.call('초기 센서 상태를 읽습니다.');
      try {
        // 알림을 켜기 전에 읽어 read와 notify가 같은 버퍼에서 섞이지 않게 한다.
        final initial = await status.read(timeout: 5);
        if (session != _session) return;
        _onChunk(initial, source: '초기 read');
      } catch (error) {
        if (session != _session) return;
        _diagnostics += '\n초기 상태 읽기 실패: $error\n';
      }
    }
    if (session != _session) return;
    onProgress?.call('센서 상태 알림을 등록합니다.');
    // 알림을 활성화하기 전에 구독하여 첫 패킷부터 받는다.
    _statusSub = status.onValueReceived.listen((value) {
      if (session == _session && device.isConnected) _onChunk(value);
    });
    await status.setNotifyValue(true);
    if (session != _session) return;
    if (!device.isConnected) throw StateError('설정 중 블루투스 연결이 끊겼습니다.');
    _ready = true;
    onConnection?.call(true);
  }

  // 펌웨어가 서비스 UUID만 바꾼 경우에도 알려진 명령/상태 UUID 쌍을
  // 같은 서비스 안에서 확인한다. 임의의 쓰기 특성에는 명령을 보내지 않는다.
  static _BleProfile? _resolveProfile(List<BluetoothService> services) {
    final matches = <_BleProfile>[];
    for (final service in services) {
      final aquarium = service.uuid == aquariumSvcUuid;
      final commandId = aquarium ? aquariumCmdUuid : cmdUuid;
      final statusId = aquarium ? aquariumStatusUuid : statusUuid;
      final commands = service.characteristics.where((c) =>
          c.uuid == commandId &&
          (c.properties.write || c.properties.writeWithoutResponse));
      final statuses = service.characteristics.where((c) =>
          c.uuid == statusId && (c.properties.notify || c.properties.indicate));
      if (commands.length != 1 || statuses.length != 1) continue;
      final profile = _BleProfile(aquarium ? 'Aquarium' : 'AquaControl',
          commands.single, statuses.single);
      if (aquarium || service.uuid == svcUuid) return profile;
      matches.add(profile);
    }
    return matches.length == 1 ? matches.single : null;
  }

  static String _profileError(List<BluetoothService> services) {
    for (final service in services
        .where((s) => s.uuid == svcUuid || s.uuid == aquariumSvcUuid)) {
      final aquarium = service.uuid == aquariumSvcUuid;
      final commands = service.characteristics
          .where((c) => c.uuid == (aquarium ? aquariumCmdUuid : cmdUuid));
      final statuses = service.characteristics
          .where((c) => c.uuid == (aquarium ? aquariumStatusUuid : statusUuid));
      if (commands.isEmpty) return '수조 서비스에 명령 쓰기 특성이 없습니다. 연결 진단을 확인해 주세요.';
      if (statuses.isEmpty) return '수조 서비스에 상태 알림 특성이 없습니다. 연결 진단을 확인해 주세요.';
      if (!commands.any(
          (c) => c.properties.write || c.properties.writeWithoutResponse)) {
        return '수조 제어 특성이 쓰기를 지원하지 않습니다. 연결 진단을 확인해 주세요.';
      }
      if (!statuses.any((c) => c.properties.notify || c.properties.indicate)) {
        return '수조 상태 특성이 알림을 지원하지 않습니다. 연결 진단을 확인해 주세요.';
      }
    }
    return 'BLE 연결은 됐지만 앱과 맞는 수조 제어 특성을 찾지 못했습니다. 연결 진단을 확인해 주세요.';
  }

  void _recordServices(List<BluetoothService> services, String heading) {
    final report = StringBuffer('\n$heading (${services.length}개)\n');
    for (final service in services) {
      report.writeln('서비스 ${service.uuid}');
      for (final characteristic in service.characteristics) {
        final p = characteristic.properties;
        final flags = [
          if (p.read) 'read',
          if (p.write) 'write',
          if (p.writeWithoutResponse) 'writeWithoutResponse',
          if (p.notify) 'notify',
          if (p.indicate) 'indicate',
        ];
        report.writeln('  특성 ${characteristic.uuid} [${flags.join(', ')}]');
      }
    }
    _diagnostics += report.toString();
  }

  // 줄바꿈 유무와 패킷 경계에 관계없이 JSON 객체 하나씩 조립한다.
  void _onChunk(List<int> value, {String source = 'notify'}) {
    if (value.isEmpty) return;
    _packets++;
    if (value.length > _maxPacketSize) _maxPacketSize = value.length;
    if (_sampleBytes < 1024) {
      final sample = value.take(1024 - _sampleBytes).toList();
      _statusSamples.add('$source ${value.length}바이트: '
          '${utf8.decode(sample, allowMalformed: true)}');
      _sampleBytes += sample.length;
    }
    for (final byte in value) {
      // 객체의 값 자리(':')가 아닌 곳에서 새 '{'가 오면 이전 메시지는
      // 잘린 것이다. 실제 20바이트 알림 뒤의 새 상태 메시지로 복구한다.
      if (byte == 123 &&
          !_inJsonString &&
          _jsonDepth == 1 &&
          _lastSyntaxByte != 58) {
        _discardedFrames++;
        _resetFrame();
      }
      if (_rxBuf.isEmpty && byte != 123) continue; // 객체 시작 '{'
      _rxBuf.add(byte);
      if (_rxBuf.length > 8192) {
        _discardedFrames++;
        _resetFrame();
        continue;
      }
      if (_inJsonString) {
        if (_jsonEscaped) {
          _jsonEscaped = false;
        } else if (byte == 92) {
          _jsonEscaped = true;
        } else if (byte == 34) {
          _inJsonString = false;
        }
      } else if (byte == 34) {
        _inJsonString = true;
      } else if (byte == 123 || byte == 91) {
        _jsonDepth++;
      } else if (byte == 125 || byte == 93) {
        _jsonDepth--;
        if (_jsonDepth == 0) {
          try {
            final json = utf8.decode(_rxBuf);
            if (jsonDecode(json) is Map<String, dynamic>) {
              _validFrames++;
              _lastJson = json;
              onStatus?.call(json);
            }
          } catch (_) {
            _discardedFrames++;
          }
          _resetFrame();
        }
      }
      if (byte != 32 && byte != 9 && byte != 10 && byte != 13) {
        _lastSyntaxByte = byte;
      }
    }
  }

  void _resetFrame() {
    _rxBuf.clear();
    _jsonDepth = 0;
    _lastSyntaxByte = null;
    _inJsonString = _jsonEscaped = false;
  }

  Future<void> write(String command) async {
    final characteristic = _cmd;
    if (!_ready || characteristic == null || _device?.isConnected != true) {
      throw StateError('블루투스 연결 후 다시 시도해 주세요.');
    }
    await characteristic.write(utf8.encode('$command\n'),
        withoutResponse: !characteristic.properties.write);
  }

  Future<void> disconnect() {
    ++_session;
    _cancelSearch();
    return _enqueue(_cleanup);
  }

  Future<void> _cleanup() async {
    _ready = false;
    _cmd = null;
    await _scanSub?.cancel();
    await _statusSub?.cancel();
    await _connSub?.cancel();
    _scanSub = _statusSub = _connSub = null;
    _resetFrame();
    try {
      if (FlutterBluePlus.isScanningNow) await FlutterBluePlus.stopScan();
    } catch (_) {}
    try {
      await _device?.disconnect();
    } catch (_) {}
    _device = null;
  }
}

class _BleProfile {
  final String name;
  final BluetoothCharacteristic command;
  final BluetoothCharacteristic status;
  _BleProfile(this.name, this.command, this.status);
}
