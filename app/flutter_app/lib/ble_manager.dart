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

  final Duration scanTimeout;
  final Duration serviceRetryDelay;
  BleManager({
    this.scanTimeout = const Duration(seconds: 15),
    this.serviceRetryDelay = const Duration(milliseconds: 600),
  });

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
  String _diagnostics = '';

  String get diagnostics => _diagnostics;

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
        _rxBuf.clear();
        onConnection?.call(false);
      }
    });
    // B보드는 20바이트 단위로 전송하므로 큰 MTU 협상 없이 연결한다.
    await device.connect(timeout: const Duration(seconds: 12), mtu: null);
    if (session != _session) return;
    onProgress?.call('수조 제어 서비스를 확인합니다.');
    _diagnostics = 'AquaControl BLE 연결 진단\n'
        '기기: ${device.platformName} (${device.remoteId})\n'
        '앱 서비스: $svcUuid\n'
        '명령 쓰기: $cmdUuid\n'
        '상태 알림: $statusUuid\n';
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
    _cmd = profile.command;
    _diagnostics += '\n사용 서비스: ${status.serviceUuid}\n';
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
      final commands = service.characteristics.where((c) =>
          c.uuid == cmdUuid &&
          (c.properties.write || c.properties.writeWithoutResponse));
      final statuses = service.characteristics.where((c) =>
          c.uuid == statusUuid &&
          (c.properties.notify || c.properties.indicate));
      if (commands.length != 1 || statuses.length != 1) continue;
      final profile = _BleProfile(commands.single, statuses.single);
      if (service.uuid == svcUuid) return profile;
      matches.add(profile);
    }
    return matches.length == 1 ? matches.single : null;
  }

  static String _profileError(List<BluetoothService> services) {
    for (final service in services.where((s) => s.uuid == svcUuid)) {
      final commands = service.characteristics.where((c) => c.uuid == cmdUuid);
      final statuses =
          service.characteristics.where((c) => c.uuid == statusUuid);
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

  // 여러 패킷으로 나뉜 상태 JSON을 줄바꿈 기준으로 조립.
  void _onChunk(List<int> value) {
    for (final byte in value) {
      if (byte == 10) {
        if (_rxBuf.isNotEmpty) {
          try {
            onStatus?.call(utf8.decode(_rxBuf));
          } catch (_) {}
          _rxBuf.clear();
        }
      } else {
        _rxBuf.add(byte);
      }
    }
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
    _rxBuf.clear();
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
  final BluetoothCharacteristic command;
  final BluetoothCharacteristic status;
  _BleProfile(this.command, this.status);
}
