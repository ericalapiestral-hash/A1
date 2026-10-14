# v1.3.6 수온 제거와 Arduino IDE 없는 PC 점검

사용자가 수온 센서를 제거하기로 해 A보드의 DS18B20 읽기·OneWire/DallasTemperature 의존성·GPIO4·온도 LCD 페이지를 제거했습니다. 현재 측정은 pH·탁도·상대 조도·수위 4종입니다. 이전 수온 단독 테스트는 `archive`로 옮겼습니다.

앱은 수온 게이지·온도 추이·목표 수온 입력을 제거하고 이전 펌웨어가 보내는 수온도 사용하지 않습니다. 히터는 수동 끄기/켜기만 표시하며 자동/온도 설정 요청은 보드에 전송하지 않습니다. 급수·순환 제어 입력은 유지합니다.

B보드 소스는 히터를 기본 OFF·수동 0/1 모드로 변경하고 자동 온도 제어·목표 수온을 제거했습니다. 자동 모드나 온도 설정 요청을 거부합니다. 부팅 때 채널을 강제로 켜던 출력 자가테스트도 제거했습니다. 급수·순환 AUTO는 그대로 유지하며 **히터 수동 ON은 통신 끊김만으로 꺼진다고 보장하지 않습니다.**

## 센서 패킷과 펌웨어 적용 범위

새 A보드는 `lux/turbidity/ph/waterLevel` 16바이트 패킷을 전송합니다. 새 B보드는 이 패킷과 이전 A의 20바이트 패킷을 모두 수신하고, 이전 수온 필드는 무시합니다. 잘못된 크기·수위 값은 수신 유효 상태를 갱신하지 않습니다. 새 B에 센서 데이터가 없으면 센서 JSON 값은 null입니다. 앱은 null을 미수신으로 표시합니다.

저장소 A/B 코드를 적용할 경우 **B를 먼저 갱신**한 뒤 A를 갱신해야 합니다. 기존 B는 새 16바이트를 처리하지 못합니다. 실제 LCD Aquarium의 펌웨어·핀은 아직 확인되지 않았으므로 이 작업에서는 실제 보드에 업로드하지 않았습니다. 새 앱 설치만으로 기존 보드의 온도 기반 자동 제어가 중지되는 것은 아닙니다. 센서를 물리적으로 빼기 전 현재 히터 출력과 펌웨어 설정을 확인해야 합니다.

## PC 점검 프로그램 v1.0 → v1.1

[프로그램 ZIP](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/tools/board_diagnostics/AquaControl-Board-Diagnostics-v1.1.zip)을 풀어 HTML을 Windows Edge/Chrome에서 엽니다. Arduino IDE·Python·PowerShell·설치용 EXE가 필요하지 않습니다.

- Web Serial 포트 선택·연결·종료, 속도 선택(기본 115200), DTR/RTS 비활성 요청.
- 선택한 USB 장치 VID/PID 식별. 실제 COM 번호는 브라우저 선택창에서 보고 입력합니다.
- 원문 로그, 수신 바이트, JSON 수·폐기 수, 최근 수신 시각, 센서 4종과 보드 출력·GPIO 보고값.
- 실제 잘린 Aquarium JSON 복구, UTF-8 조립, 기존 A/B 시리얼 출력과 상태 JSON 해석.
- 데이터 미수신 상태도 TXT 보고서로 저장. 저장 로그 파일의 별도 분석.
- 브라우저에서만 로그 처리. 서버 자동 전송·제어 write·펌웨어 업로드/삭제 기능 없음.

프로그램은 Windows USB 드라이버를 설치하거나 없는 COM 포트를 만드는 기능은 아닙니다. 포트가 없으면 케이블·USB 포트·드라이버 인식 확인이 먼저 필요합니다. 일부 보드는 시리얼 포트가 열릴 때 재부팅할 수 있으므로 처음 점검은 기존 펌웨어의 부팅 동작을 고려해야 합니다.

## Smart App Control

공인 Windows 코드서명 없는 EXE의 실행을 보장할 수 없어 설치된 Edge/Chrome에서 실행하는 HTML 방식으로 배포합니다. Windows 보안 설정을 끄거나 차단을 해제하는 절차가 없습니다. 조직의 브라우저/USB 정책 및 다른 보안 제품의 제한까지 보장하지는 않습니다. 실제 Windows Smart App Control과 ESP32 USB 실기 확인은 아직 수행하지 않았습니다.

- [Microsoft 코드서명 안내](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control)
- [Chrome Web Serial 공식 문서](https://developer.chrome.com/docs/capabilities/serial)

## 설치와 검증

- [APK](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/app/AquaControl-v1.3.6.apk) / [ZIP](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/app/AquaControl-v1.3.6.zip)
- 앱은 `1.3.6+10`. v1.3.1~v1.3.5와 같은 키로 서명해 삭제 없이 업데이트할 수 있습니다. 사전 릴리스이므로 기존 안정 릴리스 자동 업데이트에 포함되지 않습니다.
- 앱 테스트 29개와 변경 파일 분석 통과. 수온 미표시·자동 요청 미전송·센서 null·기존 BLE 호환을 검증했습니다.
- PC 로그 파서 테스트 6개 통과. 브라우저 모의 시리얼의 연결/종료·분할 JSON·보고서 저장·재연결을 검증했습니다. 실제 장치가 없는 Linux Chromium에서 secure localhost로 검증했고 Windows 실기 검증과 구분합니다.
- C++ 센서 패킷 검증 통과. 16/20바이트 수신·이전 수온 무시·잘못된 패킷 거부·A/B 헤더 일치를 확인했습니다.
- A/B 스케치를 Arduino CLI, ESP32 core 3.3.2, NimBLE-Arduino 2.5.1, LiquidCrystal 1.0.7, `esp32:esp32:esp32` 대상으로 컴파일했습니다. 실제 장비 모델이 이 빌드 대상과 같은지는 확인되지 않았습니다.

후속 PC 점검 v1.1은 사용자 로그의 Aquarium A 문자 형식과 V 단위 표시를 지원합니다. 파서 테스트 10개·브라우저 모의 연결/보고서 재분석을 검증했습니다. [변경 내용](board_diagnostics_v1.1.md). 제공된 로그에서 A/B USB 수신은 확인했으며, 실제 Aquarium 제어 명령 규격과 히터·펌프 동작은 추가 확인이 필요합니다.

APK 서명 검증 통과: 공개 인증서 SHA-256 `40ce6521868bff760955a6333977180c8e26fb9b51c55cd5c70fb66fe836f79c`. 패키지 `com.example.aqua_control`, versionCode 10, target SDK 36.

- APK: 51,629,683바이트 / SHA-256 `f72c1c3149bc3cf4ce8c95f2c287cccbf767f0fde9fa77c53bbeb1102be6b7e1`
- ZIP: 24,622,615바이트 / SHA-256 `cb26d013c9ce3a4e3735336ab8d7e1aaa9c6de6b79f14f1d6bf9574765ab2368`
