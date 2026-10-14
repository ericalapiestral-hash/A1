AquaControl Windows 보드 점검 프로그램 v1.0

Arduino IDE, Python, PowerShell 스크립트, EXE 설치 없이 사용합니다.

1. ZIP을 풀어 AquaControl-Board-Diagnostics.html을 Microsoft Edge 또는 Chrome으로 엽니다.
2. 보드를 USB 데이터 케이블로 연결합니다. 기본 속도는 115200 baud입니다.
3. [포트 선택·연결]에서 해당 COM 장치를 선택합니다. COM 번호는 선택창에서 확인해 입력할 수 있습니다.
4. 휴대폰 앱을 BLE로 연결하고 센서·출력 보고 상태와 원문 로그가 나오는지 확인합니다.
5. [점검 보고서 TXT 저장]을 누르고 보고서 내용을 공유합니다.

기능: 포트 읽기·USB VID/PID 식별·잘린 JSON 복구·현재/기존 보드 로그 해석·보고서 저장.
수온은 사용하지 않습니다. 읽은 값은 펌웨어 보고 내용이며 실제 히터 가열·펌프 회전을 확인한 것은 아닙니다.
로그는 브라우저에서 처리하고 서버에 자동 전송하지 않습니다. 제어 명령·펌웨어 업로드·삭제 기능은 없습니다.

Smart App Control:
이 배포는 서명되지 않은 EXE/CMD/PS1을 실행하지 않고 설치된 Edge/Chrome을 사용합니다.
Windows 보안 설정을 끄거나 파일 차단을 해제하도록 요구하지 않습니다.
공인 Windows 코드서명 인증서가 없는 EXE에 대해 차단되지 않는다고 보장할 수 없어 이 방식을 선택했습니다.
조직의 브라우저/USB 정책이나 다른 보안 제품이 접근을 제한하는 경우까지 보장하지는 않습니다.
실제 Windows PC에서의 Smart App Control·USB 실기 검증은 아직 수행하지 않았습니다.
공식 근거: https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control
Web Serial: https://developer.chrome.com/docs/capabilities/serial

허용한 포트가 0개여도 전체 Windows 포트가 없다는 뜻은 아닙니다. [포트 선택·연결] 목록을 확인합니다.
선택창도 비면 데이터 케이블·USB 포트·드라이버를 확인합니다. 전원 LED만으로 데이터 연결을 판단할 수 없습니다.
[USB 장치 식별]은 별도로 선택한 장치의 ID만 읽으며 드라이버 설치·COM 인식을 보장하지 않습니다.
드라이버 오류는 Windows 장치 관리자에서 하드웨어 ID와 오류 코드를 확인합니다.
포트는 열리지만 출력이 없으면 펌웨어의 로그 미출력·속도 불일치일 수 있습니다.
포트가 사용 중이면 다른 시리얼 모니터를 닫습니다.

포트를 열 때 일부 보드는 재부팅될 수 있습니다. 기존 B_board.ino는 부팅 시 출력 자가테스트가 있었습니다.
현재 Aquarium 소스는 없으므로 처음 로그 점검은 실부하 전원을 분리해 진행합니다. 새 저장소 B코드의 부팅 출력 테스트는 제거했습니다.

현재 보드의 원래 펌웨어와 핀 배치는 미확인이므로 점검 프로그램은 보드를 덮어쓰지 않습니다.
저장소의 수온 제거 코드가 실제 보드에 자동 설치된 것은 아닙니다.
기존 Capture-B-board.ps1 / Run-B-board-capture.cmd는 과거 도구이며 새 배포 ZIP에는 포함하지 않습니다.

검증은 Node 로그 파서·브라우저 모의 시리얼·소스 분석으로 수행합니다. 실제 Windows/ESP32 USB 연결은 현장 확인이 필요합니다.
