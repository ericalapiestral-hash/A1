@echo off
rem 원클릭 배포 실행기 — 사용법: deploy.cmd 1.2.0 ["릴리스 노트"]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
