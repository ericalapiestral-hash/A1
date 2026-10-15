# 수조(Aquarium) 모니터링·제어 시스템

**히터 수동 제어·연결 점검 B v1.2.0**: 현재 Aquarium 히터용 GPIO18에 수동 명령과 상태 회신을 추가했습니다. [B 업데이트·USB 릴레이 점검 ZIP](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/tools/heater_update/Aquarium-B-Heater-Update-v1.2.0.zip) · [설치·실물 확인 범위](docs/manual_heater_v1.2.0.md). 기존 앱 v1.3.8을 사용합니다. 급수 설정 자동 유지와 순환 기능을 보존하며, 실물 배선이 미확인이므로 처음에는 히터 잠금 설치 후 모든 부하 전원을 분리한 GPIO18 점검을 진행합니다. 배선/정지 신호 확인 전 활성화하지 않습니다. 수온 자동 제어는 없습니다.

**2026-10-15 설명 자료 — 현재 Aquarium 코드 기준**: [배선·동작 PNG 8장 + 쉬운 설명 TXT 묶음 다운로드](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/docs/explainer_2026-10-15/AquaControl-Explanation-2026-10-15.zip) · [내용과 그림 미리보기](docs/explainer_2026-10-15/README.md). 앱 v1.3.8 / B v1.1.0의 센서·전기·배선·코드 설명과 발표 대본을 제공합니다. 실제 A 입력 핀·장치 정격 등 미확인 정보와 아래 별도 설계의 차이를 표시했습니다. 그림은 실물 사진이 아닌 코드 기반 설명도입니다.

ESP32 **2보드 + 안드로이드 앱** 으로 수조의 센서를 모니터링하고 펌프·히터를 제어합니다.
보드끼리는 공유기 없이 **ESP-NOW(채널 1)** 로 통신하고, 폰은 B보드에 **블루투스(BLE)** 로 직접 연결합니다.

```
A보드(센서+LCD) ──ESP-NOW 채널1──▶ B보드 ──BLE(AquaControl)──▶ 폰 앱
                                     └─ 펌프·히터 직접 제어
```

## 폴더 구조
```
PJ/
├─ A_board/A_board.ino        수온 없는 센서 4종 + 16x2 LCD + ESP-NOW 송신
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
| GL5528 조도 (분압) | IO33 | 3.3V 레일 |
| SEN0189 탁도 (분압+0.1uF) | IO32 | 5V 레일 |
| PH4502C pH (분압+1uF) | IO34 | 5V 레일 |
| XKC-Y25-V 수위 (분압) | IO35 | 5V 레일 |
| 16x2 LCD(병렬) | RS=13, E=14, D4=27, D5=16, D6=17, D7=18, V0=가변저항, RW=GND | 5V |

- **배선 안정화**: 전원/GND를 레일(버스)로 데이지체인 정리 + 아날로그 노드마다 필터 커패시터. 자세히는 [docs/A_board_sensor_table.md](docs/A_board_sensor_table.md) / 배선도 [docs/A_board_wiring_v3.svg](docs/A_board_wiring_v3.svg) ([PNG](docs/A_board_wiring_v3.png)).
- 조도는 3.3V 레일에서 구동합니다. 수온 센서와 IO4 DATA·4.7kΩ 풀업은 제거했습니다. 5V 센서 신호는 분압비·실측 최대 전압을 확인해야 합니다.
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
- 히터는 0=끄기·1=수동 켜기만 지원하고 부팅 기본 OFF입니다. 수온 센서가 없어 자동 온도 제어·목표 수온은 제거했습니다. 급수·순환은 0/1/2 모드를 유지합니다.
- A보드 신호가 15초 끊기면 급수 AUTO는 OFF입니다. 히터는 수동 모드이며 통신 끊김만으로 자동 OFF된다고 보장하지 않습니다. 부팅 시 강제 출력 자가테스트는 제거했습니다.
- 전원은 장치 명판·제어 연결표를 기준으로 확인합니다. 연결표는 급수 12V DC, UP200 순환·히터 220V AC를 설명합니다. 기존 일부 배선 이미지는 이전 구성입니다.

## 사용 순서
1. Arduino IDE → Library Manager에서 **`NimBLE-Arduino`** 설치 (B보드용)
2. **A보드** ← `A_board/A_board.ino` 업로드
3. **B보드** ← `B_board/B_board.ino` 업로드
4. 폰에 APK 설치 — 아래 **앱 설치** 절 참고 (첫 실행 시 블루투스·위치 권한 허용)
5. 둘 다 전원 ON → 앱 ⚙️ → 연결방식 **블루투스** → 자동으로 `AquaControl` 검색·연결

## 앱 설치 (처음 한 번만 — 이후엔 앱이 스스로 업데이트)

**급수 수동 제어 v1.3.8 + B 펌웨어 v1.1.0**: 급수는 끄기·켜기만 제공하고 수위/타이머 자동 급수는 사용하지 않습니다. 순환 끄기·켜기·자동은 유지합니다. [새 APK](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/app/AquaControl-v1.3.8.apk) · [APK ZIP](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/app/AquaControl-v1.3.8.zip) · [B 업데이트 도구 ZIP](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/tools/aquarium_update/Aquarium-B-Pump-Update-v1.1.0.zip) · [설치·검증 범위](docs/manual_supply_v1.3.8.md). v1.3.7 위에 삭제 없이 설치합니다. B 도구에서 원본 4MB BIN과 현재 순환 v1.0.1에서 급수 전원을 연결했을 때의 정지/작동 상태를 선택한 뒤 COM5로 앱 영역만 업데이트합니다. 상태를 모르면 임의 선택해 진행하지 않습니다. 급수는 앱에서 끌 때까지 유지되며 BLE/센서 단절·수위 변화로 자동 정지하지 않습니다. 히터는 계속 사용하지 않습니다.

**순환 v1.0.1 실기 확인 완료**: 사용자가 순환 끄기·켜기와 앱 제어가 정상 작동하는 것을 확인했습니다. [이전 순환 전용 ZIP](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/tools/aquarium_update/Aquarium-B-Circulation-Update-v1.0.1.zip) · [이전 분석 기록](docs/aquarium_b_recovery_v1.0.1.md). 새 도구에는 이 버전 복원도 포함합니다. 급수 v1.1.0의 실제 작동·GPIO16 연결과 극성은 설치 후 현장에서 확인해야 합니다. [이전 앱 v1.3.7](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/app/AquaControl-v1.3.7.apk) · [수온 제거 기록](docs/no_temperature_v1.3.6.md).

**Arduino IDE 없는 PC 점검 프로그램 v1.2**: [프로그램 ZIP](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/tools/board_diagnostics/AquaControl-Board-Diagnostics-v1.2.zip)을 풀고 HTML을 Edge/Chrome에서 엽니다. 실행 파일·PowerShell 스크립트 없이 USB 로그·USB ID·센서/출력 보고 상태를 읽고 TXT로 저장합니다. [사용 방법과 검증 범위](tools/board_diagnostics/README.txt). 실제 Aquarium A의 문자 센서 로그도 해석하며 탁도 전압을 V로 표시합니다. [문자 로그 분석 기록](docs/board_diagnostics_v1.1.md). v1.2는 Aquarium 순환 JSON의 반대 표시도 수정합니다.

**원본 소스가 없는 B보드 백업**: [백업 도구 ZIP](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/tools/firmware_backup/AquaControl-Firmware-Backup-v1.0.zip)을 풀어 HTML을 Edge/Chrome에서 엽니다. 순환펌프·히터 전원을 끄고 기존 시리얼 로그 연결을 종료한 뒤 B의 COM5를 선택합니다. 플래시를 지우지 않고 전체 BIN을 읽어 원본 MD5와 비교합니다. 백업 중 보드 재부팅·수조 제어 중단과 임시 RAM 도구 실행이 있으므로 [사용 방법](tools/firmware_backup/README.txt)을 확인합니다. 실제 Windows/ESP32 백업은 검증 전입니다.

**수온 제거 후 보드 패킷**: 새 A보드는 센서 4개를 16바이트로 송신합니다. 새 B보드는 16바이트 및 기존 20바이트 A보드 패킷을 수신하며 기존 수온 필드는 무시합니다. 저장소 A/B를 적용할 때는 **B를 먼저 갱신**합니다. 현재 LCD Aquarium은 저장소 펌웨어와 일치하지 않으므로 핀·현재 펌웨어 백업을 확인하기 전 덮어쓰지 마세요. 기존 배선 이미지·과거 릴리스 문서는 해당 버전의 기록이며 현재 수온 없는 구성과 다릅니다.

**방법 1 — QR 스캔 (가장 쉬움)**: 폰 카메라로 아래 QR을 찍으면 **항상 최신 APK** 가 받아집니다. 새 버전이 나와도 QR은 그대로입니다.

<img src="docs/apk_qr.png" width="280" alt="AquaControl APK 다운로드 QR">

**방법 2 — 링크**: 폰 브라우저에서 열기 →
`https://github.com/ericalapiestral-hash/A1/releases/latest/download/AquaControl.apk`

**방법 3 — USB 설치**: 폰에서 [설정 → 개발자 옵션 → USB 디버깅] 켜고 USB 연결 후, PC에서 [install.cmd](install.cmd) 더블클릭.

**다운로드가 끝에서 멈출 때 — ZIP 우회 (23MB)**: 일부 폰 브라우저(Chrome)는 `.apk` 직다운로드를 마지막 검사 단계에서 무한 대기시킵니다. 그럴 땐 아래 QR로 **ZIP**을 받으세요 — 일반 파일로 취급돼 끝까지 받아지고, 크기도 절반입니다. 받은 뒤: 다운로드 알림(또는 내 파일 앱)에서 ZIP 탭 → **압축 해제** → 나온 `AquaControl.apk` 탭 → 설치.

<img src="docs/apk_zip_qr.png" width="240" alt="AquaControl ZIP 다운로드 QR">

`https://github.com/ericalapiestral-hash/A1/releases/latest/download/AquaControl.zip`

> 다운로드 설치 시 "출처를 알 수 없는 앱" 경고가 뜨면 **허용**하세요. 한 번 설치하면 그 뒤로는 앱 안의 자동 업데이트(v1.3.0부터 끊겨도 이어받기)가 알아서 새 버전을 안내합니다.

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
