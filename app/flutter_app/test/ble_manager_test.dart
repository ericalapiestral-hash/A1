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
    ble = BleManager(
      scanTimeout: const Duration(milliseconds: 100),
      serviceRetryDelay: Duration.zero,
    );
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

  test('실제 Aquarium UUID로 연결하고 상태 ...02와 명령 ...03을 구분한다', () async {
    platform.serviceUuid = BleManager.aquariumSvcUuid;
    platform.commandUuid = BleManager.aquariumCmdUuid;
    platform.statusUuid = BleManager.aquariumStatusUuid;
    platform.statusReadable = true;
    final api = AquaApi(bleManager: ble);
    await api.setMode(ConnMode.ble);
    expect(api.state.connected, isTrue);
    expect(api.state.temp, 24.5);
    expect(platform.discoverCount, 1);
    expect(platform.notifiedCharacteristic, BleManager.aquariumStatusUuid);
    expect(platform.readCharacteristicId, BleManager.aquariumStatusUuid);
    await api.setValue('pump1Mode', 0);
    expect(platform.lastWrite?.serviceUuid, BleManager.aquariumSvcUuid);
    expect(platform.lastWrite?.characteristicUuid, BleManager.aquariumCmdUuid);
    expect(utf8.decode(platform.lastWrite!.value), 'pump1Mode=0\n');
    expect(api.state.pump1Mode, 0);
    expect(api.connectionDiagnostics, contains('사용 구성: Aquarium'));
    expect(api.connectionDiagnostics, contains('수신 예시'));
    api.dispose();
  });

  test('Aquarium의 명령·상태 UUID 역할이 뒤바뀐 서비스는 연결하지 않는다', () async {
    platform.serviceUuid = BleManager.aquariumSvcUuid;
    platform.commandUuid = BleManager.aquariumStatusUuid;
    platform.statusUuid = BleManager.aquariumCmdUuid;
    await expectLater(ble.connect(), throwsA(isA<StateError>()));
    expect(platform.notifiedCharacteristic, isNull);
    expect(platform.lastWrite, isNull);
  });

  test('줄바꿈 없는 JSON과 여러 객체·UTF8·문자열 속 괄호를 패킷 경계와 무관하게 받는다', () async {
    platform.serviceUuid = BleManager.aquariumSvcUuid;
    platform.commandUuid = BleManager.aquariumCmdUuid;
    platform.statusUuid = BleManager.aquariumStatusUuid;
    await ble.connect();
    final statuses = <String>[];
    ble.onStatus = statuses.add;
    final payload = utf8.encode(
      '{"temp":26,"note":"수조 } { \\"","details":{"ok":true}}'
      '{"temp":27}\r\n',
    );
    for (final byte in payload) {
      platform.sendStatus(platform.connectedId!, [byte]);
    }
    await Future<void>.delayed(Duration.zero);
    expect(statuses.map(jsonDecode).toList(), [
      {
        'temp': 26,
        'note': '수조 } { "',
        'details': {'ok': true}
      },
      {'temp': 27},
    ]);
  });

  test('초기 상태 read 실패가 정상 알림 연결을 해제하지 않는다', () async {
    platform.statusReadable = true;
    platform.readError = StateError('read failed');
    final connected = <bool>[];
    ble.onConnection = connected.add;
    await ble.connect();
    expect(connected, [true]);
    expect(platform.disconnectCount, 0);
    expect(ble.diagnostics, contains('초기 상태 읽기 실패'));
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
    expect(platform.discoverCount, 2);
    expect(ble.diagnostics, contains('서비스 재검색 (0개)'));
  });

  test('서비스 UUID가 달라도 같은 명령·상태 UUID 쌍이면 연결한다', () async {
    platform.serviceUuid = Guid('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
    final connected = <bool>[];
    ble.onConnection = connected.add;
    await ble.connect();
    expect(connected, [true]);
    expect(platform.notifiedService, platform.serviceUuid);
    expect(platform.discoverCount, 1);
  });

  test('첫 검색에서 누락된 서비스는 한 번 재검색한 뒤 연결한다', () async {
    platform.missingOnFirstDiscovery = true;
    final connected = <bool>[];
    ble.onConnection = connected.add;
    await ble.connect();
    expect(platform.discoverCount, 2);
    expect(connected, [true]);
    expect(ble.diagnostics, contains('첫 서비스 검색 (0개)'));
    expect(ble.diagnostics, contains('서비스 재검색 (1개)'));
  });

  test('다른 특성 UUID는 추측하지 않고 발견한 UUID·속성을 진단에 보존한다', () async {
    platform.serviceUuid = Guid('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
    platform.commandUuid = Guid('beb5483e-36e1-4688-b7f5-ea07361b26a8');
    final api = AquaApi(bleManager: ble);
    await api.setMode(ConnMode.ble);
    expect(api.state.connected, isFalse);
    expect(api.connectionError, contains('제어 특성을 찾지 못했습니다'));
    expect(
        api.connectionDiagnostics, contains(platform.serviceUuid.toString()));
    expect(
        api.connectionDiagnostics, contains(platform.commandUuid.toString()));
    expect(api.connectionDiagnostics, contains('[write]'));
    expect(api.connectionDiagnostics, contains('[notify]'));
    await api.setValue('heaterMode', 1);
    expect(api.state.heaterMode, 2);
    expect(platform.notifiedService, isNull);
    api.dispose();
  });

  test('상태 특성 UUID가 있어도 알림 속성이 없으면 원인을 구분한다', () async {
    platform.statusNotifiable = false;
    await expectLater(
      ble.connect(),
      throwsA(predicate((e) => e.toString().contains('알림을 지원하지 않습니다'))),
    );
    expect(platform.notifiedService, isNull);
    expect(platform.disconnectCount, 1);
  });

  test('서비스 재검색을 기다릴 때 데모로 전환하면 연결을 완료하지 않는다', () async {
    platform.missingOnFirstDiscovery = true;
    ble = BleManager(serviceRetryDelay: const Duration(milliseconds: 100));
    final api = AquaApi(bleManager: ble);
    final pending = api.setMode(ConnMode.ble);
    await platform.discoveryStarted.future;
    await api.setMode(ConnMode.demo);
    await pending;
    expect(api.state.connected, isFalse);
    expect(api.connectionError, isNull);
    expect(platform.discoverCount, 1);
    expect(platform.notifiedService, isNull);
    expect(platform.disconnectCount, 1);
    api.dispose();
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
  final writes = StreamController<BmCharacteristicData>.broadcast();
  final descriptors = StreamController<BmDescriptorData>.broadcast();
  String advertisedName = 'Aquarium';
  String platformName = '';
  bool hasService = true;
  bool missingOnFirstDiscovery = false;
  bool statusNotifiable = true;
  bool statusReadable = false;
  Guid serviceUuid = BleManager.svcUuid;
  Guid commandUuid = BleManager.cmdUuid;
  Guid statusUuid = BleManager.statusUuid;
  Guid? notifiedService, notifiedCharacteristic, readCharacteristicId;
  DeviceIdentifier? connectedId;
  BmWriteCharacteristicRequest? lastWrite;
  bool sendInitialStatus = false;
  Object? scanError, notifyError, readError;
  int connectCount = 0, disconnectCount = 0, discoverCount = 0, sequence = 0;
  late Completer<void> scanStarted, discoveryStarted;

  void reset() {
    advertisedName = 'Aquarium';
    platformName = '';
    hasService = true;
    missingOnFirstDiscovery = false;
    statusNotifiable = true;
    statusReadable = false;
    serviceUuid = BleManager.svcUuid;
    commandUuid = BleManager.cmdUuid;
    statusUuid = BleManager.statusUuid;
    notifiedService = null;
    notifiedCharacteristic = readCharacteristicId = null;
    connectedId = null;
    lastWrite = null;
    sendInitialStatus = false;
    scanError = notifyError = readError = null;
    connectCount = disconnectCount = discoverCount = 0;
    sequence++;
    scanStarted = Completer<void>();
    discoveryStarted = Completer<void>();
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
  Stream<BmCharacteristicData> get onCharacteristicWritten => writes.stream;
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
    connectedId = request.remoteId;
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
        serviceUuid: serviceUuid,
        characteristicUuid: uuid,
        instanceId: 0,
        descriptors: [],
        properties: BmCharacteristicProperties(
          broadcast: false,
          read: notify && statusReadable,
          writeWithoutResponse: false,
          write: !notify,
          notify: notify && statusNotifiable,
          indicate: false,
          authenticatedSignedWrites: false,
          extendedProperties: false,
          notifyEncryptionRequired: false,
          indicateEncryptionRequired: false,
        ),
      );

  @override
  Future<bool> discoverServices(BmDiscoverServicesRequest request) async {
    discoverCount++;
    discoveries.add(BmDiscoverServicesResult(
      remoteId: request.remoteId,
      services: hasService && !(missingOnFirstDiscovery && discoverCount == 1)
          ? [
              BmBluetoothService(
                remoteId: request.remoteId,
                primaryServiceUuid: null,
                serviceUuid: serviceUuid,
                characteristics: [
                  characteristic(request.remoteId, commandUuid),
                  characteristic(request.remoteId, statusUuid, notify: true),
                ],
              )
            ]
          : [],
      success: true,
      errorCode: 0,
      errorString: '',
    ));
    if (!discoveryStarted.isCompleted) discoveryStarted.complete();
    return true;
  }

  @override
  Future<bool> setNotifyValue(BmSetNotifyValueRequest request) async {
    if (notifyError != null) throw notifyError!;
    notifiedService = request.serviceUuid;
    notifiedCharacteristic = request.characteristicUuid;
    if (sendInitialStatus) {
      for (final part in ['{"temp":', '25}\n']) {
        sendStatus(request.remoteId, utf8.encode(part));
      }
    }
    return false;
  }

  void sendStatus(DeviceIdentifier id, List<int> value) {
    values.add(BmCharacteristicData(
      remoteId: id,
      primaryServiceUuid: null,
      serviceUuid: serviceUuid,
      characteristicUuid: statusUuid,
      instanceId: 0,
      value: value,
      success: true,
      errorCode: 0,
      errorString: '',
    ));
  }

  @override
  Future<bool> readCharacteristic(BmReadCharacteristicRequest request) async {
    if (readError != null) throw readError!;
    readCharacteristicId = request.characteristicUuid;
    sendStatus(request.remoteId, utf8.encode('{"temp":24.5}'));
    return true;
  }

  @override
  Future<bool> writeCharacteristic(BmWriteCharacteristicRequest request) async {
    lastWrite = request;
    writes.add(BmCharacteristicData(
      remoteId: request.remoteId,
      primaryServiceUuid: request.primaryServiceUuid,
      serviceUuid: request.serviceUuid,
      characteristicUuid: request.characteristicUuid,
      instanceId: request.instanceId,
      value: request.value,
      success: true,
      errorCode: 0,
      errorString: '',
    ));
    return true;
  }
}
