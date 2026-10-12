import 'dart:async';
import 'dart:convert';

import 'package:aqua_control/aqua_api.dart';
import 'package:aqua_control/ble_manager.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_blue_plus_platform_interface/flutter_blue_plus_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final platform = FakeBlePlatform();
  FlutterBluePlusPlatform.instance = platform;
  late BleManager ble;

  setUp(() {
    platform.reset();
    ble = BleManager(scanTimeout: const Duration(milliseconds: 100));
  });
  tearDown(() async => ble.disconnect());

  test('Aquarium 광고명은 오래된 플랫폼 이름이 있어도 연결된다', () async {
    platform.platformName = 'Old board name';
    final connected = <bool>[];
    ble.onConnection = connected.add;
    await ble.connect();
    expect(platform.connectCount, 1);
    expect(connected, [true]);
  });

  test('기존 AquaControl 이름도 연결된다', () async {
    platform.advertisedName = 'AquaControl';
    await ble.connect();
    expect(platform.connectCount, 1);
  });

  test('다른 기기에는 연결하지 않고 검색 시간 초과를 전달한다', () async {
    platform.advertisedName = 'Headphones';
    await expectLater(ble.connect(), throwsA(isA<TimeoutException>()));
    expect(platform.connectCount, 0);
    expect(FlutterBluePlus.isScanningNow, isFalse);
  });

  test('수조 서비스가 없으면 연결 완료를 표시하지 않고 정리한다', () async {
    platform.hasService = false;
    final connected = <bool>[];
    ble.onConnection = connected.add;
    await expectLater(ble.connect(), throwsA(isA<StateError>()));
    expect(connected, isEmpty);
    expect(platform.disconnectCount, 1);
    await expectLater(ble.write('heaterMode=1'), throwsA(isA<StateError>()));
  });

  test('알림 구독 실패도 호출자에게 전달되고 다시 연결할 수 있다', () async {
    platform.notifyError = StateError('notification failed');
    await expectLater(ble.connect(), throwsA(isA<StateError>()));
    platform.notifyError = null;
    await ble.connect();
    expect(platform.connectCount, 2);
  });

  test('알림 활성화 중 도착한 첫 JSON을 패킷 경계와 무관하게 받는다', () async {
    final statuses = <String>[];
    ble.onStatus = statuses.add;
    platform.sendInitialStatus = true;
    await ble.connect();
    await Future<void>.delayed(Duration.zero);
    expect(statuses, ['{"temp":25}']);
  });

  test('검색 도중 데모로 전환하면 검색과 연결 시도가 취소된다', () async {
    platform.advertisedName = 'Headphones';
    final api = AquaApi(bleManager: ble);
    final pending = api.setMode(ConnMode.ble);
    await platform.scanStarted.future;
    await Future<void>.delayed(Duration.zero);
    await api.setMode(ConnMode.demo);
    await pending;
    expect(api.mode, ConnMode.demo);
    expect(api.connecting, isFalse);
    expect(api.connectionError, isNull);
    expect(platform.connectCount, 0);
    expect(FlutterBluePlus.isScanningNow, isFalse);
    api.dispose();
  });

  test('권한 오류는 화면에 전달되고 실제 제어 실패를 성공으로 반영하지 않는다', () async {
    platform.scanError = StateError('Permission BLUETOOTH_SCAN required');
    final api = AquaApi(bleManager: ble);
    await api.setMode(ConnMode.ble);
    expect(api.connecting, isFalse);
    expect(api.connectionError, contains('근처 기기 권한'));
    await api.setValue('heaterMode', 1);
    expect(api.state.heaterMode, 2);
    expect(api.connectionError, contains('명령을 보내지 못했습니다'));
    api.dispose();
  });
}

final class FakeBlePlatform extends FlutterBluePlusPlatform {
  final scans = StreamController<BmScanResponse>.broadcast();
  final connections = StreamController<BmConnectionStateResponse>.broadcast();
  final discoveries = StreamController<BmDiscoverServicesResult>.broadcast();
  final values = StreamController<BmCharacteristicData>.broadcast();
  final descriptors = StreamController<BmDescriptorData>.broadcast();
  String advertisedName = 'Aquarium';
  String platformName = '';
  bool hasService = true;
  bool sendInitialStatus = false;
  Object? scanError, notifyError;
  int connectCount = 0, disconnectCount = 0, sequence = 0;
  late Completer<void> scanStarted;

  void reset() {
    advertisedName = 'Aquarium';
    platformName = '';
    hasService = true;
    sendInitialStatus = false;
    scanError = notifyError = null;
    connectCount = disconnectCount = 0;
    sequence++;
    scanStarted = Completer<void>();
  }

  @override
  Stream<BmScanResponse> get onScanResponse => scans.stream;
  @override
  Stream<BmConnectionStateResponse> get onConnectionStateChanged =>
      connections.stream;
  @override
  Stream<BmDiscoverServicesResult> get onDiscoveredServices =>
      discoveries.stream;
  @override
  Stream<BmCharacteristicData> get onCharacteristicReceived => values.stream;
  @override
  Stream<BmDescriptorData> get onDescriptorWritten => descriptors.stream;
  @override
  Future<bool> isSupported(BmIsSupportedRequest request) async => true;
  @override
  Future<BmBluetoothAdapterState> getAdapterState(
          BmBluetoothAdapterStateRequest request) async =>
      BmBluetoothAdapterState(adapterState: BmAdapterStateEnum.on);

  @override
  Future<bool> startScan(BmScanSettings request) async {
    if (scanError != null) throw scanError!;
    scans.add(BmScanResponse.fromMap({
      'advertisements': [
        {
          'remote_id': '00:00:00:00:00:$sequence',
          'platform_name': platformName,
          'adv_name': advertisedName,
          'connectable': 1,
        }
      ],
    }));
    if (!scanStarted.isCompleted) scanStarted.complete();
    return true;
  }

  void connection(DeviceIdentifier id, BmConnectionStateEnum state) {
    connections.add(BmConnectionStateResponse(
      remoteId: id,
      connectionState: state,
      disconnectReasonCode: null,
      disconnectReasonString: null,
    ));
  }

  @override
  Future<bool> connect(BmConnectRequest request) async {
    connectCount++;
    connection(request.remoteId, BmConnectionStateEnum.connected);
    return true;
  }

  @override
  Future<bool> disconnect(BmDisconnectRequest request) async {
    disconnectCount++;
    connection(request.remoteId, BmConnectionStateEnum.disconnected);
    return true;
  }

  BmBluetoothCharacteristic characteristic(DeviceIdentifier id, Guid uuid,
          {bool notify = false}) =>
      BmBluetoothCharacteristic(
        remoteId: id,
        primaryServiceUuid: null,
        serviceUuid: BleManager.svcUuid,
        characteristicUuid: uuid,
        instanceId: 0,
        descriptors: [],
        properties: BmCharacteristicProperties(
          broadcast: false,
          read: false,
          writeWithoutResponse: false,
          write: !notify,
          notify: notify,
          indicate: false,
          authenticatedSignedWrites: false,
          extendedProperties: false,
          notifyEncryptionRequired: false,
          indicateEncryptionRequired: false,
        ),
      );

  @override
  Future<bool> discoverServices(BmDiscoverServicesRequest request) async {
    discoveries.add(BmDiscoverServicesResult(
      remoteId: request.remoteId,
      services: hasService
          ? [
              BmBluetoothService(
                remoteId: request.remoteId,
                primaryServiceUuid: null,
                serviceUuid: BleManager.svcUuid,
                characteristics: [
                  characteristic(request.remoteId, BleManager.cmdUuid),
                  characteristic(request.remoteId, BleManager.statusUuid,
                      notify: true),
                ],
              )
            ]
          : [],
      success: true,
      errorCode: 0,
      errorString: '',
    ));
    return true;
  }

  @override
  Future<bool> setNotifyValue(BmSetNotifyValueRequest request) async {
    if (notifyError != null) throw notifyError!;
    if (sendInitialStatus) {
      for (final part in ['{"temp":', '25}\n']) {
        values.add(BmCharacteristicData(
          remoteId: request.remoteId,
          primaryServiceUuid: null,
          serviceUuid: BleManager.svcUuid,
          characteristicUuid: BleManager.statusUuid,
          instanceId: 0,
          value: utf8.encode(part),
          success: true,
          errorCode: 0,
          errorString: '',
        ));
      }
    }
    return false;
  }
}
