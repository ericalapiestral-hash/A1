============================================================
 수조 컨트롤 — 안드로이드 앱 (Flutter)
 연결 방식 3가지: 데모 / WiFi(+핫스팟, HTTP) / 블루투스(BLE)
============================================================

ESP32 수조 시스템을 폰으로 모니터링/제어.
ESP32 없이도 "데모 모드"로 바로 실행되어 UI를 확인할 수 있음.


------------------------------------------------------------
[화면]  다크 오션 테마
------------------------------------------------------------
- 상단: 제목 + 연결상태(데모/WiFi/블루투스) + 설정
- 원형 게이지: 수온, pH (+ 수온 추세 그래프, pH 스케일)
- 미니 카드: 탁도 / 조도 / 수위
- 장치 제어 4개: 히터(목표온도 직접입력) / 산소 / 펌프1 / 펌프2
   각 장치 끄기·켜기·자동(슬라이딩 토글) + 자동 주기 입력
- 설정 → 연결 방식 선택:
   · 데모 : 가상 데이터
   · WiFi : 주소 입력(핫스팟 192.168.4.1 / 집WiFi 192.168.0.50 빠른선택)
   · 블루투스 : B보드(AquaControl) 검색·연결


------------------------------------------------------------
[실행 방법]
------------------------------------------------------------
1) Flutter SDK 설치 (한 번만) → flutter doctor 확인
2) 이 flutter_app 폴더에서:
     flutter create .        ← 안드로이드 빌드 뼈대 생성(lib/ pubspec.yaml 유지)
     flutter pub get         ← 패키지 받기(http, flutter_blue_plus)
3) 실행:
     flutter run             ← 폰 USB 연결
   또는 APK:
     flutter build apk       ← build/app/outputs/flutter-apk/app-release.apk

* 켜면 기본 "데모 모드". 설정에서 WiFi/블루투스로 바꾸면 실제 B보드에 연결.


------------------------------------------------------------
[블루투스(BLE) 사용 시 — 안드로이드 권한 필수]
------------------------------------------------------------
flutter create . 후 생성된 파일 두 곳을 수정:

(1) android/app/src/main/AndroidManifest.xml  의 <manifest> 안에 추가:
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN"
        android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <!-- 안드로이드 11 이하 호환 -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />

(2) android/app/build.gradle 의 defaultConfig:
    minSdkVersion 21   (또는 그 이상)

* 앱에서 블루투스 선택 시 권한 팝업을 "허용"해야 검색됩니다.


------------------------------------------------------------
[앱 ↔ B보드 통신 규약]
------------------------------------------------------------
WiFi/HTTP:
  GET /status  → 아래 JSON
  GET /set?heaterMode=1  (키 하나씩)

BLE (서비스/특성 UUID = 펌웨어와 동일):
  서비스 6e400001-b5a3-f393-e0a9-e50e24dcca9e
  쓰기  6e400002-...  ← "key=value\n" 형식으로 명령
  알림  6e400003-...  → 상태 JSON('\n' 종료)를 1초마다 수신

상태 JSON:
{
  "temp":24.8,"ph":7.1,"turb":12,"lux":63,"level":1,
  "heaterMode":2,"oxygenMode":2,"pump1Mode":2,"pump2Mode":2,
  "tempSet":25.0,"oxyOn":15,"oxyOff":15,"circOn":5,"circOff":25,
  "heaterOn":true,"oxygenOn":false,"pump1On":false,"pump2On":true
}
키: heaterMode oxygenMode pump1Mode pump2Mode tempSet oxyOn oxyOff circOn circOff
(mode: 0=끄기 1=켜기 2=자동)


------------------------------------------------------------
[대응 펌웨어]
------------------------------------------------------------
A보드 : A_board_code.ino         (센서 + ESP-NOW, 채널 자동맞춤)
B보드 : B_board_MAIN_BLE.ino     (제어+LCD+WiFi+핫스팟+HTTP+블루투스) ← 최종
        (WiFi만 먼저 테스트하려면 B_board_MAIN.ino — BLE 없음)


------------------------------------------------------------
[파일 구조]
------------------------------------------------------------
pubspec.yaml          http, flutter_blue_plus
lib/main.dart         앱 시작 + 테마
lib/models.dart       상태 데이터 + JSON 매핑
lib/aqua_api.dart     연결모드(데모/WiFi/BLE) + 통신 + 데모 시뮬
lib/ble_manager.dart  블루투스(BLE) 스캔·연결·송수신
lib/widgets.dart      게이지·추세그래프·슬라이딩토글·온도입력
lib/dashboard.dart    화면(UI) 전체
