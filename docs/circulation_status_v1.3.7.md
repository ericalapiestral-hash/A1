# v1.3.7 Aquarium 순환 상태 표시 수정

현재 Aquarium 실기에서 순환펌프가 타이머로 도는 동안 앱은 보드 OFF, 멈춘 동안 보드 ON을 표시한다는 현장 보고가 있었습니다. 이전 앱은 Aquarium의 `cir`를 일반 ON/OFF 값으로 해석했습니다. v1.3.7은 Aquarium BLE 구성에서만 순환 응답을 `cir=0 → ON`, `cir=1 → OFF`로 해석합니다. 원문 JSON은 연결 진단에 그대로 남겨 확인할 수 있습니다.

명시적인 `pump2On` 값이 있으면 이 값을 우선 사용합니다. 저장소 AquaControl BLE 구성, 급수 `sup`, 히터 `ht`, A보드의 문자 `순환=1` 등은 기존 의미를 유지합니다. 이 변경은 관찰된 순환 표시를 맞추는 것이며, 원래 펌웨어가 `cir`에 GPIO 레벨을 넣는지, 릴레이 극성이나 접점 배선이 다른지는 원본 코드·배선으로 별도 확인해야 합니다.

## 실제 수동 제어의 확인 범위

사용자 보고로 앱 버튼을 누를 때 B보드 로그에 `pump2Mode=0/1`이 출력되는 것은 확인됐습니다. 순환 릴레이의 제어선도 B보드에 연결돼 있습니다. 다만 받은 문자열을 로그에 찍는 것만으로 명령 처리·모드 변경·출력 적용이 확인되지는 않습니다. 수동 끄기에도 펌프가 계속 도는 문제는 아직 해결되지 않았습니다.

이번 릴리스는 명령 형식을 바꾸거나 임의의 대체 명령을 전송하지 않습니다. 순환 `pump2Mode=0/1/2`와 주기 `circOn/circOff`의 전송 형식은 기존과 같습니다. 보드가 같은 설정 키와 값을 새 상태 메시지로 돌려준 경우에만 설정값 확인으로 표시합니다. `cir`가 자동 타이머에 의해 바뀌었다는 사실을 수동 명령 적용 성공으로 표시하지 않습니다.

실제 B의 로그는 저장소 `B_board.ino`와 다르고, 원래 Aquarium 소스·GPIO 배치는 미확인입니다. 이 작업에서 실제 B보드 펌웨어를 업로드하지 않았습니다. 저장소 코드의 수동 순환 모드는 이미 자동 타이머보다 우선하므로, 이 소스를 수정했다고 현재 보드의 제어 문제가 해결되는 것은 아닙니다.

다음 확인은 B보드를 115200 baud로 기록하면서 앱의 순환 끄기를 누른 뒤 `pump2Mode=0` 앞뒤 로그를 읽는 것입니다. 명령 수신 뒤 설정 적용/거부 메시지가 있는지, 순환 상태·출력 핀 값이 바뀌는지 비교해야 합니다. 제어 GPIO, 릴레이 극성·접점과 기존 펌웨어 백업을 확인한 뒤 현재 하드웨어에 맞는 수정 범위를 결정합니다.

## 다운로드

- [APK](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/app/AquaControl-v1.3.7.apk)
- [앱 ZIP](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/app/AquaControl-v1.3.7.zip)
- [PC 점검 프로그램 v1.2](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/tools/board_diagnostics/AquaControl-Board-Diagnostics-v1.2.zip)
- [기존 B 펌웨어 백업 도구 v1.0](https://raw.githubusercontent.com/ericalapiestral-hash/A1/main/tools/firmware_backup/AquaControl-Firmware-Backup-v1.0.zip)

앱 버전은 `1.3.7+11`이며 v1.3.1~v1.3.6과 같은 키로 서명합니다. 해당 버전 위에 삭제 없이 설치할 수 있습니다. 사전 릴리스이며 기존 안정 릴리스 자동 업데이트에 포함되지 않습니다. PC v1.2도 Aquarium JSON `cir`의 같은 표시 해석을 적용합니다. 명시적 `pump2On`·문자 상태·GPIO 숫자는 반전하지 않습니다.

## 원본 소스가 없는 B보드의 백업

실제 수신 로그는 `[BLE CMD] pump2Mode=0`이며 저장소 B 코드의 `[CMD수신]`과 다릅니다. 받은 문자열을 로그에 남기는 것과 명령을 설정에 반영하는 것은 구분해야 합니다. 원래 펌웨어가 사용하는 제어 명령을 조사하기 위해 별도 HTML 백업 도구를 제공합니다.

펌프·히터 전원을 끈 뒤 기존 시리얼 점검 연결을 종료하고 백업 HTML에서 B의 COM5를 선택합니다. 일반 ESP32의 전체 플래시 용량을 자동 확인해 BIN을 읽습니다. 보드 원본에서 계산한 MD5와 받은 파일의 MD5가 일치한 경우에만 BIN 저장을 제공합니다. BIN과 보고서 TXT를 저장해 채팅으로 공유하며 공개 저장소에는 올리지 않습니다. BIN에는 기존 프로그램과 보드 설정이 포함됩니다. 원본 Arduino 소스를 그대로 복원하는 기능은 아닙니다.

백업은 부트로더 통신과 임시 RAM 읽기 도구를 사용하므로 보드를 재부팅하고 수조 제어를 잠시 중단합니다. 플래시 쓰기·삭제 기능은 제공하지 않으며 해당 프로토콜 명령도 거부합니다. 성공 시 기존 프로그램 재시작을 요청합니다. 중단·오류 후에는 부하 전원을 끈 상태에서 USB를 다시 연결합니다. 기존 PC 로그 점검 도구의 수동 읽기 동작과는 별도 프로그램입니다.

## 검증

- 앱 테스트 32개와 변경 파일 분석 통과. Aquarium 두 순환 상태, 다른 출력 미반전, 명시적 상태 우선, OFF 요청 이후 ON 유지 시 적용 미확인, 타이머 상태 변화만으로 명령 성공을 표시하지 않는 동작을 확인했습니다.
- PC 파서 테스트 11개 및 Linux Chromium secure localhost 모의 Web Serial 연결·보고서 저장/재분석 통과.
- 백업 코어 테스트 6개와 브라우저 모의 로더 검증: 플래시 쓰기/삭제 거부, 전체 길이·MD5 검증, 모의 BIN·TXT 다운로드, 손상 파일·취소 시 BIN 미제공. 공식 Espressif esptool-js 0.7.0/SparkMD5 3.0.2 배포를 npm SHA-512 무결성으로 확인해 번들과 라이선스를 포함했습니다. 실제 Windows/ESP32 백업은 아직 수행하지 않았습니다.
- 실제 펌프 동작과 B보드 명령 처리 수정은 확인 전입니다. 사용자 제공 현장 관찰에 맞춘 표시 수정과 실제 출력 제어 검증을 구분합니다.

APK 릴리스 빌드·서명 검증을 통과했습니다. 패키지는 `com.example.aqua_control`, 버전 코드 `11`, 대상 SDK `36`입니다. 서명 인증서 SHA-256은 `40ce6521868bff760955a6333977180c8e26fb9b51c55cd5c70fb66fe836f79c`로 이전 v1.3.1~v1.3.6과 같습니다.

- AquaControl-v1.3.7.apk: 51,629,687바이트, SHA-256 `48fe00df3f4b41cb23b87c86ab32a9d918bb8c3cd019df8c29f6afeda31c9e65`
- AquaControl-v1.3.7.zip: 24,624,764바이트, SHA-256 `10de9a6919cb09357779bbfd554e6772b6599f3c4774b7640c379061ea26ee8d`
- AquaControl-Board-Diagnostics-v1.2.zip: 11,505바이트, SHA-256 `d2f40e1342a97b9172d0ea22ac101db310361e21a0347a344b46560ecfe46008`
- AquaControl-Firmware-Backup-v1.0.zip: 129,416바이트, SHA-256 `5488badfe48648721d305c4ed5965ed07e1b8f2aab8cf19ac20cefa322cdec81`

후속 백업 분석에서 실제 B가 `pump2Mode`를 처리하지 않고 개별 순환 수동 모드도 없는 것을 확인했습니다. 현재 배선에 맞춘 순환 전용 B 소스와 대상 검증 업데이트 도구를 준비했습니다. 앱 v1.3.7은 그대로 사용하며 실제 B 설치가 필요합니다. [분석과 복구 v1.0.1](aquarium_b_recovery_v1.0.1.md).
