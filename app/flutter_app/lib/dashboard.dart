import 'package:flutter/material.dart';
import 'aqua_api.dart';
import 'control_tab.dart';
import 'monitor_tab.dart';
import 'neo.dart';
import 'update_ui.dart';
import 'updater.dart';

/// 앱 셸 — 모니터링/제어 2탭 + 하단 네오모피즘 메뉴 + 설정 시트
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final AquaApi api = AquaApi();
  final Updater updater = Updater();

  int _tab = 0;
  bool _checkingUpdate = false;
  String? _updateMsg; // 설정 시트에 보여줄 확인 결과

  @override
  void initState() {
    super.initState();
    api.start();
    _initUpdater();
  }

  /// 현재 버전을 읽고, 잠시 뒤 조용히 새 버전이 있는지 확인한다.
  Future<void> _initUpdater() async {
    await updater.loadCurrentVersion();
    if (!mounted) return;
    setState(() {});
    if (!kUpdateConfigured) return;
    // 첫 화면이 그려진 뒤에 확인 (시작 지연 방지)
    await Future<void>.delayed(const Duration(seconds: 3));
    if (!mounted) return;
    await checkForUpdate(context, updater, silent: true);
  }

  @override
  void dispose() {
    api.dispose();
    updater.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Neo.bg,
      body: ListenableBuilder(
        listenable: api,
        builder: (context, _) {
          return Column(
            children: [
              Expanded(
                child: IndexedStack(
                  index: _tab,
                  children: [
                    MonitorTab(api: api, onSettings: _openSettings),
                    ControlTab(api: api, onSettings: _openSettings),
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: _tabBar(),
              ),
            ],
          );
        },
      ),
    );
  }

  // ---------------- 하단 탭 메뉴 ----------------

  Widget _tabBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      child: NeoBox(
        radius: 26,
        padding: const EdgeInsets.all(8),
        child: Row(
          children: [
            _tabItem(0, Icons.speed_outlined, '모니터링'),
            const SizedBox(width: 8),
            _tabItem(1, Icons.tune, '제어'),
          ],
        ),
      ),
    );
  }

  Widget _tabItem(int i, IconData icon, String label) {
    final sel = _tab == i;
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 22, color: sel ? Neo.teal : Neo.sub),
        const SizedBox(height: 4),
        Text(label,
            style: TextStyle(
                fontFamily: sel ? Neo.display : Neo.body,
                fontSize: 12,
                color: sel ? Neo.teal : Neo.sub)),
      ],
    );
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => setState(() => _tab = i),
        child: sel
            ? NeoInset(
                radius: 20,
                padding: const EdgeInsets.symmetric(vertical: 11),
                child: Center(child: content),
              )
            : Padding(
                padding: const EdgeInsets.symmetric(vertical: 11),
                child: Center(child: content),
              ),
      ),
    );
  }

  // ---------------- 설정 시트 ----------------

  Widget _connBtn(String label, ConnMode m, StateSetter setSheet) {
    final sel = api.mode == m;
    final text = Center(
      child: Text(label,
          style: TextStyle(
              fontFamily: sel ? Neo.display : Neo.body,
              color: sel ? Neo.teal : Neo.sub,
              fontSize: 13)),
    );
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {
          api.setMode(m);
          setSheet(() {});
        },
        child: SizedBox(
          height: 44,
          child: sel
              ? NeoInset(radius: 14, child: text)
              : NeoBox(radius: 14, depth: 4, child: text),
        ),
      ),
    );
  }

  void _openSettings() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Neo.bg,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
                20, 14, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                        color: Neo.divider,
                        borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                const Text('설정',
                    style: TextStyle(
                        fontFamily: Neo.display,
                        color: Neo.ink,
                        fontSize: 19)),
                const SizedBox(height: 10),
                const Text('연결 방식',
                    style: TextStyle(color: Neo.sub, fontSize: 12)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _connBtn('데모', ConnMode.demo, setSheet),
                    const SizedBox(width: 12),
                    _connBtn('블루투스', ConnMode.ble, setSheet),
                  ],
                ),
                const SizedBox(height: 16),
                if (api.mode == ConnMode.ble) ...[
                  const Text('블루투스로 B보드(AquaControl)를 검색·연결합니다.',
                      style: TextStyle(color: Neo.sub, fontSize: 12)),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                          backgroundColor: Neo.teal,
                          padding: const EdgeInsets.symmetric(vertical: 14)),
                      onPressed: () => setSheet(() => api.setMode(ConnMode.ble)),
                      child: const Text('다시 검색',
                          style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text('* 블루투스/위치 권한을 허용해야 검색됩니다.',
                      style: TextStyle(color: Neo.sub, fontSize: 11)),
                ] else ...[
                  const Text('ESP32 없이 가상 데이터로 UI를 확인합니다.',
                      style: TextStyle(color: Neo.sub, fontSize: 12)),
                ],
                const SizedBox(height: 20),
                const Divider(color: Neo.divider, height: 1),
                const SizedBox(height: 16),
                _updateSection(ctx, setSheet),
              ],
            ),
          );
        },
      ),
    ).whenComplete(() => _updateMsg = null);
  }

  /// 설정 시트의 '앱 업데이트' 영역
  Widget _updateSection(BuildContext ctx, StateSetter setSheet) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('앱 업데이트',
                style: TextStyle(color: Neo.sub, fontSize: 12)),
            const Spacer(),
            if (updater.currentVersion.isNotEmpty)
              Text('현재 v${updater.currentVersion}',
                  style: const TextStyle(color: Neo.sub, fontSize: 11.5)),
          ],
        ),
        const SizedBox(height: 10),
        GestureDetector(
          onTap: _checkingUpdate
              ? null
              : () async {
                  setSheet(() {
                    _checkingUpdate = true;
                    _updateMsg = null;
                  });
                  final msg = await checkForUpdate(ctx, updater);
                  if (!ctx.mounted) {
                    _checkingUpdate = false;
                    return;
                  }
                  setSheet(() {
                    _checkingUpdate = false;
                    _updateMsg = msg;
                  });
                },
          child: NeoBox(
            radius: 14,
            depth: 4,
            padding: const EdgeInsets.symmetric(vertical: 13),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_checkingUpdate)
                  const SizedBox(
                    width: 15,
                    height: 15,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Neo.teal),
                  )
                else
                  const Icon(Icons.system_update, color: Neo.teal, size: 18),
                const SizedBox(width: 8),
                Text(_checkingUpdate ? '확인 중…' : '업데이트 확인',
                    style: const TextStyle(
                        color: Neo.ink,
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
        if (_updateMsg != null) ...[
          const SizedBox(height: 8),
          Text(_updateMsg!,
              style: TextStyle(
                  color: updater.stage == UpdateStage.failed
                      ? Neo.warn
                      : Neo.teal,
                  fontSize: 11.5)),
        ],
        if (!kUpdateConfigured) ...[
          const SizedBox(height: 8),
          const Text('* lib/updater.dart 의 GitHub 저장소를 설정해야 동작합니다.',
              style: TextStyle(color: Neo.sub, fontSize: 11)),
        ],
      ],
    );
  }
}
