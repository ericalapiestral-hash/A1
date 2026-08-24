# ===================================================================
#  원클릭 배포 스크립트 — 버전올림 → 빌드 → 커밋 → 태그 → 푸시 → 릴리스
#  -----------------------------------------------------------------
#  사용법:   .\deploy.cmd 1.2.0
#            .\deploy.cmd 1.2.0 "히터 자동 모드 개선"
#
#  하는 일:  pubspec.yaml 버전 올림 → flutter build apk --release
#            → app/AquaControl.apk 교체 → git 커밋+태그+푸시
#            → GitHub 릴리스 생성 + APK 첨부
#
#  ※ 이 PC의 디버그 키(%USERPROFILE%\.android\debug.keystore)로 서명되므로
#    반드시 이 PC에서 실행해야 기존 앱 위에 업데이트가 설치됩니다.
#    그 키스토어 파일을 백업해 두세요 — 잃어버리면 업데이트가 끊깁니다.
# ===================================================================
param(
    [Parameter(Mandatory = $true)][string]$Version,   # 예: 1.2.0
    [string]$Notes = ''                                # 릴리스 노트 (생략 가능)
)

$ErrorActionPreference = 'Continue'
function Fail([string]$msg) { Write-Host "`n[실패] $msg" -ForegroundColor Red; exit 1 }
function Step([string]$msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

if ($Version -notmatch '^\d+\.\d+\.\d+$') { Fail "버전은 1.2.0 형식(숫자.숫자.숫자)이어야 합니다: '$Version'" }

$root    = $PSScriptRoot
$appDir  = Join-Path $root 'app\flutter_app'
$pubspec = Join-Path $appDir 'pubspec.yaml'
$apkOut  = Join-Path $appDir 'build\app\outputs\flutter-apk\app-release.apk'
$apkDist = Join-Path $root 'app\AquaControl.apk'

# ---- 도구 확인 ----
foreach ($c in 'git', 'gh', 'flutter') {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) {
        Fail "'$c' 명령을 찾을 수 없습니다. 새 터미널에서 다시 시도하세요."
    }
}
try { gh auth status *> $null } catch {}
if ($LASTEXITCODE -ne 0) { Fail 'gh 로그인이 필요합니다:  gh auth login' }

Set-Location $root

# ---- 버전 검사 ----
$content = [IO.File]::ReadAllText($pubspec)
if ($content -notmatch '(?m)^version:\s*(\d+\.\d+\.\d+)\+(\d+)') {
    Fail 'pubspec.yaml 에서 version 을 찾지 못했습니다.'
}
$curVer = $Matches[1]; $curBuild = [int]$Matches[2]

if (([version]$Version) -le ([version]$curVer)) {
    Fail "새 버전($Version)이 현재 버전($curVer)보다 커야 합니다."
}
if ((git tag -l "v$Version") -eq "v$Version") { Fail "태그 v$Version 이 이미 있습니다." }

$newBuild = $curBuild + 1
Step "버전 변경: $curVer+$curBuild  ->  $Version+$newBuild"
$content = $content -replace '(?m)^version:\s*\S+', "version: $Version+$newBuild"
[IO.File]::WriteAllText($pubspec, $content, [Text.UTF8Encoding]::new($false))

# ---- 빌드 ----
Step 'APK 빌드 (flutter build apk --release)'
Push-Location $appDir
flutter build apk --release
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Fail "빌드 실패 (exit $code)" }
Copy-Item $apkOut $apkDist -Force
$mb = '{0:N1}' -f ((Get-Item $apkDist).Length / 1MB)
Write-Host "APK: $apkDist ($mb MB)"

# ---- 커밋 · 태그 · 푸시 ----
Step 'git 커밋 - 태그 - 푸시'
git add -A;                  if ($LASTEXITCODE -ne 0) { Fail 'git add 실패' }
git commit -m "v$Version";   if ($LASTEXITCODE -ne 0) { Fail 'git commit 실패' }
git tag "v$Version";         if ($LASTEXITCODE -ne 0) { Fail 'git tag 실패' }
git push origin main;        if ($LASTEXITCODE -ne 0) { Fail 'git push 실패 (인터넷/인증 확인)' }
git push origin "v$Version"; if ($LASTEXITCODE -ne 0) { Fail '태그 push 실패' }

# ---- 릴리스 ----
Step "GitHub 릴리스 v$Version 생성"
if ($Notes -eq '') { $Notes = "AquaControl v$Version" }
# APK 직다운로드가 막히는 폰 브라우저(Chrome 등)를 위한 ZIP 동봉.
# 앱 내 자동 업데이트는 .apk 에셋만 사용하므로 ZIP 이 있어도 영향 없음.
$zipPath = Join-Path $env:TEMP 'AquaControl.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $apkDist -DestinationPath $zipPath
gh release create "v$Version" "$apkDist#AquaControl.apk" "$zipPath#AquaControl.zip" --title "v$Version" --notes $Notes
if ($LASTEXITCODE -ne 0) { Fail 'gh release create 실패' }

Step '배포 완료!'
Write-Host "릴리스: https://github.com/ericalapiestral-hash/A1/releases/tag/v$Version"
Write-Host '앱에서 [설정 > 앱 업데이트 > 업데이트 확인] 을 누르면 새 버전이 뜹니다.'
