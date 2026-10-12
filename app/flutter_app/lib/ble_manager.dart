import 'dart:async';
import 'dart:convert';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

/// B보드(ESP32)와 BLE로 통신. 서비스 UUID는 펌웨어와 동일해야 함.
class BleManager {
  static const String deviceName = 'AquaControl';
  static const Set<String> deviceNames = {'aquacontrol', 'aquarium'};
  static final Guid svcUuid = Guid('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
  static final Guid cmdUuid = Guid('6e400002-b5a3-f393-e0a9-e50e24dcca9e');
  static final Guid statusUuid = Guid('6e400003-b5a3-f393-e0a9-e50e24dcca9e');

  final Duration scanTimeout;
  BleManager({this.scanTimeout = const Duration(seconds: 15)});

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
      } catch (_) {
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
    final services = await device.discoverServices();
    if (session != _session) return;
    BluetoothCharacteristic? status;
    for (final service in services) {
      if (service.uuid != svcUuid) continue;
      for (final characteristic in service.characteristics) {
        if (characteristic.uuid == statusUuid) status = characteristic;
        if (characteristic.uuid == cmdUuid) _cmd = characteristic;
      }
    }
    if (status == null ||
        _cmd == null ||
        !(status.properties.notify || status.properties.indicate) ||
        !(_cmd!.properties.write || _cmd!.properties.writeWithoutResponse)) {
      throw StateError('기기에 수조 제어 서비스가 없습니다. B보드 펌웨어를 확인해 주세요.');
    }
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
