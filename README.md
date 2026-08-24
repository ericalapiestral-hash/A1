# 수조(Aquarium) 모니터링·제어 시스템

ESP32 **2보드 + 안드로이드 앱** 으로 수조의 센서를 모니터링하고 펌프·히터를 제어합니다.
보드끼리는 공유기 없이 **ESP-NOW(채널 1)** 로 통신하고, 폰은 B보드에 **블루투스(BLE)** 로 직접 연결합니다.

```
A보드(센서+LCD) ──ESP-NOW 채널1──▶ B보드 ──BLE(AquaControl)──▶ 폰 앱
                                     └─ 펌프·히터 직접 제어
```

## 폴더 구조
```
PJ/
├─ A_board/A_board.ino        센서 측정 + 16x2 LCD + ESP-NOW 송신
├─ B_board/B_board.ino        ESP-NOW 수신 + BLE 서버 + 펌프·히터 제어
├─ UP200_pump/UP200_pump.ino  순환펌프(협신 UP200, 220V) 타이머 컨트롤러(독립 실행)
├─ app/
│  ├─ AquaControl.apk         설치용 안드로이드 앱 (git 제외 — Releases에서 받으세요)
│  └─ flutter_app/            앱 소스(Flutter)
│     └─ lib/updater.dart     앱 자동 업데이트 (GitHub Releases 확인·다운로드·설치)
├─ docs/                      배선도(png/svg) + 핀 연결표(md)  (배선도 재생성: _gen/build_diagrams.js)
├─ deploy.cmd / deploy.ps1    원클릭 배포 (예: .\deploy.cmd 1.2.0)
└─ README.md
```

## A보드 — 센서 + LCD (DevKitC 38핀 + GPIO 확장보드 / 브레드보드)
| 부품 | 핀 | 전원 |
|---|---|---|
| DS18B20 수온 (4.7kΩ 풀업→3.3V) | IO4 | 3.3V 레일 |
| GL5528 조도 (분압) | IO33 | 3.3V 레일 |
| SEN0189 탁도 (분압+0.1uF) | IO32 | 5V 레일 |
| PH4502C pH (분압+1uF) | IO34 | 5V 레일 |
| XKC-Y25-V 수위 (분압) | IO35 | 5V 레일 |
| 16x2 LCD(병렬) | RS=13, E=14, D4=27, D5=16, D6=17, D7=18, V0=가변저항, RW=GND | 5V |

- **배선 안정화**: 전원/GND를 레일(버스)로 데이지체인 정리 + 아날로그 노드마다 필터 커패시터. 자세히는 [docs/A_board_sensor_table.md](docs/A_board_sensor_table.md) / 배선도 [docs/A_board_wiring_v3.svg](docs/A_board_wiring_v3.svg) ([PNG](docs/A_board_wiring_v3.png)).
- 수온·조도는 3.3V 레일 구동(신호 native 3.3V → 분압 불필요), 5V 센서는 분압(×0.67) 거쳐 ADC1로.
- 2초마다 측정 → LCD 표시 + B보드로 ESP-NOW 전송
- 수위: 물이 차면 1(정상), 빠지면 0(부족)
- pH 음수 방지 0~14 클램프, 시리얼에 raw 전압 `(x.xxV)` 출력(보정용)

## B보드 — 제어 + BLE 서버 (WROOM-32, 3채널 릴레이 LOW 트리거)
| 출력 | 핀 / 릴레이 채널 | 부하 |
|---|---|---|
| 펌프1 (급수) | IO25 / CH1 | SZH-PWAT-040 12V DC |
| 펌프2 (순환) | IO26 / CH2 | **협신 UP200 220V AC** (활선 직렬) |
| 히터 | IO27 / CH3 | HE-50W 220V AC |

> 산소(oxygen)는 핀 없는 로직 전용. 릴레이 VCC에 디커플링 커패시터(10uF/0.1uF) 권장. 배선: [docs/B_board_control_table.md](docs/B_board_control_table.md) / 배선도 [docs/B_board_wiring_v3.svg](docs/B_board_wiring_v3.svg) ([PNG](docs/B_board_wiring_v3.png)).
> **순환펌프(UP200, 220V)**: 전원코드 활선(L)을 잘라 릴레이에 직렬 삽입 + 타이머. 코드 [UP200_pump/UP200_pump.ino](UP200_pump/UP200_pump.ino), 배선도 [docs/UP200_circulation_wiring.svg](docs/UP200_circulation_wiring.svg) ([PNG](docs/UP200_circulation_wiring.png)).

- **BLE 기기명 `AquaControl`** 로 광고 → 앱이 직접 검색·연결 (핫스팟/WiFi 없음)
- `ESP-NOW(WiFi 라디오)` 수신과 `BLE` 송신을 **동시** 수행 → BLE는 RAM 가벼운 **NimBLE** 사용
- BLE 특성: status(notify) 상태 JSON 푸시 / cmd(write) `key=value` 명령
- 모드 0=끄기·1=켜기·2=자동. 자동: 히터=수온<목표, 펌프1=수위 낮을 때 급수, 펌프2=순환 주기
- A보드 신호 15초 끊기면 히터 안전 OFF
- 전원: ESP32=USB 5V / 펌프=각각 12V 어댑터 / 히터=잘린 220V 코드

## 사용 순서
1. Arduino IDE → Library Manager에서 **`NimBLE-Arduino`** 설치 (B보드용)
2. **A보드** ← `A_board/A_board.ino` 업로드
3. **B보드** ← `B_board/B_board.ino` 업로드
4. 폰에 APK 설치 — GitHub **Releases** 에서 받거나 직접 빌드한 `app/AquaControl.apk` (첫 실행 시 블루투스·위치 권한 허용)
5. 둘 다 전원 ON → 앱 ⚙️ → 연결방식 **블루투스** → 자동으로 `AquaControl` 검색·연결

## 앱 자동 업데이트 (GitHub Releases)

앱이 실행될 때와 **설정 ⚙️ → 앱 업데이트 → 업데이트 확인** 을 누를 때, GitHub Releases의 최신 릴리스를 조회해 새 버전이면 APK를 내려받아 설치 화면을 띄웁니다. 추가 pub 패키지 없이 `http` + 네이티브 채널([MainActivity.kt](app/flutter_app/android/app/src/main/kotlin/com/example/aqua_control/MainActivity.kt))로 구현돼 있습니다.

**최초 1회 설정** — [lib/updater.dart](app/flutter_app/lib/updater.dart) 상단의 저장소를 본인 것으로 바꾸세요.
```dart
const String kGithubOwner = 'YOUR_GITHUB_ID';   // ← 본인 GitHub 아이디
const String kGithubRepo  = 'aqua-control';     // ← 저장소 이름
```

**새 버전 배포** — 명령 하나로 끝납니다. [deploy.ps1](deploy.ps1) 이 버전올림 → 빌드 → 커밋 → 태그 → 푸시 → 릴리스 생성까지 전부 처리합니다.
```bash
.\deploy.cmd 1.2.0 "히터 자동 모드 개선"
```
- 첫 번째 인자: 새 버전 (pubspec 의 `version:` 과 릴리스 태그 `v1.2.0` 을 자동으로 맞춤)
- 두 번째 인자: 릴리스 노트 (생략 가능)
- 현재 버전보다 낮거나 같으면, 태그가 이미 있으면, 빌드가 실패하면 그 단계에서 멈춥니다.

| 항목 | 값 |
|---|---|
| 확인 주소 | `api.github.com/repos/<owner>/<repo>/releases/latest` |
| 버전 비교 | 릴리스 태그(`v1.2.0`) ↔ 앱 `versionName` — 숫자 단위 비교 |
| APK 저장 위치 | 앱 전용 외부 저장소 `.../Android/data/<패키지>/files/updates/` (저장소 권한 불필요) |
| 필요 권한 | `INTERNET`, `REQUEST_INSTALL_PACKAGES` + Android 8.0↑ '이 출처의 앱 설치 허용' (앱이 설정 화면으로 안내) |

> 저장소가 비공개면 GitHub API 조회에 토큰이 필요합니다. 공개 저장소를 권장합니다.

**서명 규칙 (중요)**
- 배포는 **항상 이 PC에서** `deploy.cmd` 로 하세요. APK가 이 PC의 디버그 키(`%USERPROFILE%\.android\debug.keystore`)로 서명되는데, 업데이트는 기존 앱과 **서명이 같아야** 설치되기 때문입니다. 다른 PC에서 빌드하면 "앱이 설치되지 않았습니다"로 실패합니다.
- 🔑 `%USERPROFILE%\.android\debug.keystore` 파일을 USB나 클라우드에 **백업**해 두세요. Windows 재설치 등으로 이 파일이 사라지면 기존 설치된 앱을 업데이트할 방법이 없어집니다(재설치 필요). PC를 바꿀 땐 이 파일을 같은 위치에 복사하면 됩니다.
- 나중에 정식 릴리스 키로 옮기고 싶으면 `app/flutter_app/android/key.properties` 만 만들면 됩니다([build.gradle.kts](app/flutter_app/android/app/build.gradle.kts)가 자동 인식). 단, 키를 바꾸는 시점엔 폰에서 1회 삭제 후 재설치가 필요합니다.

> ESP-NOW 채널 1 고정. B보드 STA MAC `80:F3:DA:5E:5C:7C` 는 A보드 `boardB_mac[]` 에 이미 입력됨.
> 보드 교체 시: B보드 시리얼에 뜨는 MAC을 A보드에 다시 넣으세요.
> 데모 모드: ESP32 없이 가상 데이터로 앱 UI만 확인할 때 사용.
