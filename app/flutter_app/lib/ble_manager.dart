import 'dart:async';
import 'dart:convert';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

/// B보드(ESP32)와 BLE로 통신.
/// 서비스/특성 UUID는 펌웨어(B_board.ino)와 동일해야 함.
class BleManager {
  static const String deviceName = 'AquaControl';
  static final Guid svcUuid = Guid('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
  static final Guid cmdUuid = Guid('6e400002-b5a3-f393-e0a9-e50e24dcca9e'); // write
  static final Guid statusUuid =
      Guid('6e400003-b5a3-f393-e0a9-e50e24dcca9e'); // notify

  void Function(String json)? onStatus;
  void Function(bool connected)? onConnection;

  BluetoothDevice? _device;
  BluetoothCharacteristic? _cmd;
  StreamSubscription? _scanSub, _statusSub, _connSub;
  final List<int> _rxBuf = [];

  Future<void> connect() async {
    await disconnect();
    if (await FlutterBluePlus.isSupported == false) return;

    // 기기명으로 검색 (서비스 UUID 필터 없이 — 광고 패킷 호환성 ↑)
    await FlutterBluePlus.startScan(
      timeout: const Duration(seconds: 10),
    );

    _scanSub = FlutterBluePlus.scanResults.listen((results) async {
      for (final r in results) {
        final name = r.device.platformName.isNotEmpty
            ? r.device.platformName
            : r.advertisementData.advName;
        if (name == deviceName) {
          await FlutterBluePlus.stopScan();
          await _scanSub?.cancel();
          _scanSub = null;
          await _setup(r.device);
          break;
        }
      }
    });
  }

  Future<void> _setup(BluetoothDevice d) async {
    _device = d;
    _connSub = d.connectionState.listen((s) {
      onConnection?.call(s == BluetoothConnectionState.connected);
    });

    await d.connect(timeout: const Duration(seconds: 12));
    final services = await d.discoverServices();
    for (final s in services) {
      if (s.uuid != svcUuid) continue;
      for (final c in s.characteristics) {
        if (c.uuid == statusUuid) {
          await c.setNotifyValue(true);
          _statusSub = c.onValueReceived.listen(_onChunk);
        } else if (c.uuid == cmdUuid) {
          _cmd = c;
        }
      }
    }
  }

  // 상태 JSON이 여러 패킷으로 쪼개져 올 수 있어 '\n' 기준으로 조립
  void _onChunk(List<int> v) {
    for (final b in v) {
      if (b == 10) {
        if (_rxBuf.isNotEmpty) {
          try {
            onStatus?.call(utf8.decode(_rxBuf));
          } catch (_) {}
          _rxBuf.clear();
        }
      } else {
        _rxBuf.add(b);
      }
    }
  }

  Future<void> write(String cmd) async {
    final c = _cmd;
    if (c == null) return;
    try {
      await c.write(utf8.encode('$cmd\n'), withoutResponse: false);
    } catch (_) {}
  }

  Future<void> disconnect() async {
    await _scanSub?.cancel();
    await _statusSub?.cancel();
    await _connSub?.cancel();
    _scanSub = _statusSub = _connSub = null;
    _rxBuf.clear();
    try {
      await _device?.disconnect();
    } catch (_) {}
    _device = null;
    _cmd = null;
  }
}
