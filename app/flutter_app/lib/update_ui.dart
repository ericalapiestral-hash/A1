import 'package:flutter/material.dart';

import 'updater.dart';

// ===================================================================
//  업데이트 UI — 확인 / 다운로드 진행률 / 설치 안내
// ===================================================================

// C 시안(웜 네오모피즘) 라이트 팔레트
const _teal = Color(0xFF0F766E);
const _deep = Color(0xFFFFFFFF); // 틸 버튼 위 글자색
const _sheetBg = Color(0xFFF7F5F1);

/// 업데이트 확인 → 새 버전이 있으면 안내 다이얼로그를 띄운다.
///
/// [silent] 가 true면(앱 시작 시 자동 확인) 최신 상태이거나 오류일 때 조용히
/// 넘어간다. false면(설정에서 직접 누름) 호출한 쪽에 보여줄 문구를 돌려준다.
/// 반환값이 null 이면 따로 표시할 내용이 없다는 뜻(=다이얼로그를 띄웠거나 무시).
Future<String?> checkForUpdate(
  BuildContext context,
  Updater updater, {
  bool silent = false,
}) async {
  if (!updater.supported) {
    return silent ? null : '안드로이드에서만 지원합니다.';
  }

  final info = await updater.check();
  if (!context.mounted) return null;

  if (info == null) {
    if (silent) return null;
    if (updater.stage == UpdateStage.failed) {
      return updater.error ?? '업데이트 확인에 실패했습니다.';
    }
    return '최신 버전입니다 (v${updater.currentVersion}).';
  }

  if (silent) {
    if (updater.promptedThisSession) return null;
    updater.promptedThisSession = true;
  }

  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => UpdateDialog(updater: updater, info: info),
  );
  return null;
}

class UpdateDialog extends StatefulWidget {
  final Updater updater;
  final ReleaseInfo info;

  const UpdateDialog({super.key, required this.updater, required this.info});

  @override
  State<UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<UpdateDialog> {
  Updater get u => widget.updater;
  ReleaseInfo get info => widget.info;

  Future<void> _start() async {
    // Android 8.0+ : '출처를 알 수 없는 앱' 설치 권한이 있어야 설치 화면이 뜬다
    if (!await u.canInstall()) {
      if (!mounted) return;
      final go = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          backgroundColor: _sheetBg,
          title: const Text('설치 권한 필요',
              style: TextStyle(color: Color(0xFF1B1D20), fontSize: 17)),
          content: const Text(
            '이 앱이 업데이트를 설치하려면 "이 출처의 앱 설치 허용"을 켜야 합니다.\n'
            '설정 화면으로 이동할까요?',
            style: TextStyle(color: Color(0xFF5A6069), fontSize: 13.5),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('취소',
                  style: TextStyle(color: Color(0xFF8A8F98))),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('설정 열기', style: TextStyle(color: _teal)),
            ),
          ],
        ),
      );
      if (go == true) await u.openInstallPermission();
      return;
    }

    final path = await u.download();
    if (!mounted) return;
    if (path == null) {
      setState(() {});
      return;
    }
    await u.install();
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: u,
      builder: (context, _) {
        final busy = u.stage == UpdateStage.downloading;
        final ready = u.stage == UpdateStage.readyToInstall;
        final failed = u.stage == UpdateStage.failed;

        return PopScope(
          canPop: !busy,
          child: AlertDialog(
            backgroundColor: _sheetBg,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18)),
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: _teal.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.system_update,
                      color: _teal, size: 19),
                ),
                const SizedBox(width: 11),
                const Text('새 버전이 있습니다',
                    style: TextStyle(
                        color: Color(0xFF1B1D20),
                        fontSize: 16.5,
                        fontWeight: FontWeight.w700)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _versionChip('현재  v${u.currentVersion}', Color(0xFFC9CCD1),
                        Color(0xFF8A8F98)),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Icon(Icons.arrow_forward,
                          color: Color(0xFF9AA0A6), size: 15),
                    ),
                    _versionChip('v${info.version}', _teal, _deep,
                        filled: true),
                  ],
                ),
                if (info.sizeText.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text('${info.apkName} · ${info.sizeText}',
                      style: const TextStyle(
                          color: Color(0xFF9AA0A6), fontSize: 11.5)),
                ],
                if (info.notes.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  const Text('변경 내용',
                      style: TextStyle(color: Color(0xFF8A8F98), fontSize: 12)),
                  const SizedBox(height: 6),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 150),
                    child: SingleChildScrollView(
                      child: Text(info.notes,
                          style: const TextStyle(
                              color: Color(0xFF5A6069),
                              fontSize: 13,
                              height: 1.45)),
                    ),
                  ),
                ],
                if (busy) ...[
                  const SizedBox(height: 18),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: u.progress > 0 ? u.progress : null,
                      minHeight: 7,
                      backgroundColor: Color(0xFFE8E4DB),
                      valueColor:
                          const AlwaysStoppedAnimation<Color>(_teal),
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text('내려받는 중… ${(u.progress * 100).toStringAsFixed(0)}%',
                      style: const TextStyle(
                          color: Color(0xFF8A8F98), fontSize: 12)),
                ],
                if (ready) ...[
                  const SizedBox(height: 16),
                  const Text('다운로드 완료. 설치 화면이 뜨지 않으면 아래 버튼을 다시 누르세요.',
                      style: TextStyle(color: _teal, fontSize: 12.5)),
                ],
                if (failed && u.error != null) ...[
                  const SizedBox(height: 16),
                  Text(u.error!,
                      style: const TextStyle(
                          color: Color(0xFFC94F3D), fontSize: 12.5)),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: busy ? null : () => Navigator.pop(context),
                child: Text(ready ? '닫기' : '나중에',
                    style: TextStyle(
                        color: busy ? Color(0xFFC9CCD1) : Color(0xFF8A8F98))),
              ),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: _teal),
                onPressed: busy ? null : _start,
                child: Text(
                  ready ? '설치' : (failed ? '다시 시도' : '업데이트'),
                  style: const TextStyle(
                      color: _deep, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _versionChip(String t, Color border, Color fg,
      {bool filled = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: filled ? border : Colors.transparent,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(t,
          style: TextStyle(
              color: fg,
              fontSize: 12,
              fontWeight: filled ? FontWeight.w700 : FontWeight.w500)),
    );
  }
}
