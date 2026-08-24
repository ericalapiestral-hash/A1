@echo off
rem ===================================================================
rem  USB 로 연결된 폰에 AquaControl 앱 설치 (더블클릭 실행)
rem  준비물: 폰의 [개발자 옵션 > USB 디버깅] 켜기 + USB 연결
rem  -r = 이미 설치돼 있으면 데이터 유지한 채 덮어쓰기
rem ===================================================================
setlocal
set ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
if not exist "%ADB%" set ADB=adb

echo 연결된 기기 확인 중...
"%ADB%" devices
echo.
echo APK 설치 중... (폰에 확인 창이 뜨면 허용을 누르세요)
"%ADB%" install -r "%~dp0app\AquaControl.apk"
echo.
if %ERRORLEVEL%==0 (echo [완료] 설치 성공!) else (echo [실패] 폰의 USB 디버깅 허용 여부와 연결 상태를 확인하세요.)
pause
