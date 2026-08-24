import 'package:flutter/material.dart';
import 'aqua_api.dart';
import 'models.dart';
import 'update_ui.dart';
import 'updater.dart';
import 'widgets.dart';

const _bg = Color(0xFF0A1520);
const _teal = Color(0xFF2DD4BF);
const _deep = Color(0xFF06303A);

BoxDecoration _glass() => BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF16304A), Color(0xFF0E2030)],
      ),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: Colors.white.withOpacity(0.06)),
    );

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final AquaApi api = AquaApi();
  final Updater updater = Updater();

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
      backgroundColor: _bg,
      body: ListenableBuilder(
        listenable: api,
        builder: (context, _) {
          final s = api.state;
          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _header(context, s),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _gaugeRow(s),
                      const SizedBox(height: 12),
                      _miniStatsRow(s),
                      const SizedBox(height: 24),
                      _sectionTitle('장치 제어'),
                      const SizedBox(height: 12),
                      _heaterCard(s),
                      const SizedBox(height: 12),
                      _pump1Card(s),
                      const SizedBox(height: 12),
                      _pump2Card(s),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _header(BuildContext context, AquariumState s) {
    final topPad = MediaQuery.of(context).padding.top;
    late final Color chipColor;
    late final String chipText;
    switch (api.mode) {
      case ConnMode.demo:
        chipColor = const Color(0xFFFBBF24);
        chipText = '데모 모드';
        break;
      case ConnMode.ble:
        chipColor = s.connected ? _teal : const Color(0xFFFBBF24);
        chipText = s.connected ? '블루투스' : 'BT 검색중';
        break;
    }
    return ClipRect(
      child: Stack(
        children: [
          Container(
            height: 150 + topPad,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF0E7C86), Color(0xFF0A1520)],
              ),
            ),
          ),
          Positioned(top: -50, right: -30, child: _glow(160, _teal.withOpacity(0.30))),
          Positioned(top: 20, left: -50, child: _glow(140, const Color(0xFF0E7C86).withOpacity(0.45))),
          Padding(
            padding: EdgeInsets.fromLTRB(22, topPad + 16, 10, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(Icons.water_drop,
                                color: Colors.white, size: 20),
                          ),
                          const SizedBox(width: 12),
                          const Text('수조 컨트롤',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 19,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -0.2)),
                        ],
                      ),
                      const Padding(
                        padding: EdgeInsets.only(left: 4, top: 10),
                        child: Text('실시간 모니터링 · 자동 제어',
                            style: TextStyle(
                                color: Colors.white60, fontSize: 11.5)),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
                  decoration: BoxDecoration(
                    color: chipColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: chipColor.withOpacity(0.8)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: chipColor,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(color: chipColor, blurRadius: 8),
                          ],
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(chipText,
                          style: TextStyle(color: chipColor, fontSize: 11)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.settings_outlined,
                      color: Colors.white70),
                  onPressed: _openSettings,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _glow(double size, Color c) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [c, c.withOpacity(0)]),
        ),
      );

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.only(left: 4),
        child: Text(t,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2)),
      );

  Widget _gaugeRow(AquariumState s) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.fromLTRB(14, 18, 14, 14),
              decoration: _glass(),
              child: Column(
                children: [
                  SizedBox(
                    height: 132,
                    child: CircularGauge(
                      value: s.temp,
                      min: 15,
                      max: 35,
                      display: s.temp.toStringAsFixed(1),
                      unit: '℃',
                      label: '수온',
                      color: const Color(0xFFFB923C),
                      icon: Icons.thermostat,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Sparkline(
                      values: api.tempHistory, color: const Color(0xFFFB923C)),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              padding: const EdgeInsets.fromLTRB(14, 18, 14, 14),
              decoration: _glass(),
              child: Column(
                children: [
                  SizedBox(
                    height: 132,
                    child: CircularGauge(
                      value: s.ph,
                      min: 0,
                      max: 14,
                      display: s.ph.toStringAsFixed(2),
                      unit: '',
                      label: 'pH 산성도',
                      color: const Color(0xFFA78BFA),
                      icon: Icons.science,
                    ),
                  ),
                  const SizedBox(height: 8),
                  _phScale(s.ph),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _phScale(double ph) {
    final pos = (ph / 14).clamp(0.0, 1.0);
    return LayoutBuilder(builder: (context, c) {
      return SizedBox(
        height: 34,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  height: 6,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(3),
                    gradient: const LinearGradient(colors: [
                      Color(0xFFEF4444),
                      Color(0xFF22C55E),
                      Color(0xFF3B82F6),
                    ]),
                  ),
                ),
                Positioned(
                  left: (c.maxWidth - 10) * pos,
                  top: -2,
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: _bg, width: 2),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    });
  }

  Widget _miniStatsRow(AquariumState s) {
    return Row(
      children: [
        Expanded(
            child: _miniStat(Icons.opacity, '탁도',
                s.turb.toStringAsFixed(0), 'NTU', const Color(0xFF38BDF8))),
        const SizedBox(width: 12),
        Expanded(
            child: _miniStat(Icons.light_mode, '조도',
                s.lux.toStringAsFixed(0), '%', const Color(0xFFFCD34D))),
        const SizedBox(width: 12),
        Expanded(
            child: _miniStat(
                Icons.waves,
                '수위',
                s.level == 1 ? '정상' : '부족',
                '',
                s.level == 1 ? _teal : Colors.redAccent)),
      ],
    );
  }

  Widget _miniStat(
      IconData icon, String label, String value, String unit, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: _glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 10),
          Text(label,
              style: const TextStyle(color: Colors.white54, fontSize: 11)),
          const SizedBox(height: 3),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Flexible(
                child: Text(value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: unit.isEmpty ? color : Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w700)),
              ),
              if (unit.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(left: 2),
                  child: Text(unit,
                      style:
                          const TextStyle(color: Colors.white38, fontSize: 10)),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _deviceShell({
    required IconData icon,
    required Color color,
    required String title,
    required bool on,
    required int mode,
    required ValueChanged<int> onMode,
    Widget? extra,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _glass(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(title,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600)),
              ),
              _statusPill(on),
            ],
          ),
          const SizedBox(height: 16),
          SlidingSegment(
            index: mode,
            labels: const ['끄기', '켜기', '자동'],
            onChanged: onMode,
            color: color,
          ),
          if (extra != null) ...[
            const SizedBox(height: 16),
            extra,
          ],
        ],
      ),
    );
  }

  Widget _statusPill(bool on) {
    final Color c = on ? _teal : Colors.white24;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: c.withOpacity(0.16),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: on ? _teal : Colors.white38,
              shape: BoxShape.circle,
              boxShadow:
                  on ? [const BoxShadow(color: _teal, blurRadius: 8)] : null,
            ),
          ),
          const SizedBox(width: 6),
          Text(on ? '작동중' : '정지',
              style: TextStyle(
                  color: on ? _teal : Colors.white54, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _heaterCard(AquariumState s) {
    return _deviceShell(
      icon: Icons.local_fire_department,
      color: const Color(0xFFFB923C),
      title: '히터',
      on: s.heaterOn,
      mode: s.heaterMode,
      onMode: (m) => api.setValue('heaterMode', m),
      extra: Row(
        children: [
          const Text('목표 수온',
              style: TextStyle(color: Colors.white70, fontSize: 13)),
          const Spacer(),
          TempInput(
            value: s.tempSet,
            color: const Color(0xFFFB923C),
            onChanged: (v) => api.setValue('tempSet', v),
          ),
        ],
      ),
    );
  }

  Widget _pump1Card(AquariumState s) {
    return _deviceShell(
      icon: Icons.water_drop,
      color: _teal,
      title: '펌프1 · 급수',
      on: s.pump1On,
      mode: s.pump1Mode,
      onMode: (m) => api.setValue('pump1Mode', m),
    );
  }

  Widget _pump2Card(AquariumState s) {
    return _deviceShell(
      icon: Icons.sync,
      color: const Color(0xFF34D399),
      title: '펌프2 · 순환',
      on: s.pump2On,
      mode: s.pump2Mode,
      onMode: (m) => api.setValue('pump2Mode', m),
      extra: _intervalRow(s.circOn, s.circOff, (v) => api.setValue('circOn', v),
          (v) => api.setValue('circOff', v)),
    );
  }

  // ── 순환펌프 반복 타이머: 켜짐/꺼짐 시간을 직접 입력 ──
  Widget _intervalRow(
      int on, int off, ValueChanged<int> onOn, ValueChanged<int> onOff) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: const [
            Icon(Icons.timer_outlined, size: 16, color: Colors.white54),
            SizedBox(width: 6),
            Text('순환 타이머 (반복)',
                style: TextStyle(color: Colors.white70, fontSize: 13)),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: _timeField('켜짐', on, _teal, onOn)),
            const SizedBox(width: 10),
            Expanded(
                child: _timeField('꺼짐', off, const Color(0xFF34D399), onOff)),
          ],
        ),
        const SizedBox(height: 8),
        Text('${_fmtMin(on)} 켜고 → ${_fmtMin(off)} 끄기를 반복',
            style: const TextStyle(color: Colors.white38, fontSize: 11)),
      ],
    );
  }

  Widget _timeField(
      String label, int minutes, Color accent, ValueChanged<int> onChanged) {
    return GestureDetector(
      onTap: () => _openTimerInput(label, minutes, onChanged),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 13),
        decoration: BoxDecoration(
          color: Colors.white10,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(color: accent.withOpacity(.45)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style:
                        const TextStyle(color: Colors.white38, fontSize: 11)),
                const SizedBox(height: 3),
                Text(_fmtMin(minutes),
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w700)),
              ],
            ),
            const Icon(Icons.edit, size: 15, color: Colors.white38),
          ],
        ),
      ),
    );
  }

  String _fmtMin(int m) {
    if (m >= 60) {
      final h = m ~/ 60, mm = m % 60;
      return mm == 0 ? '$h시간' : '$h시간 $mm분';
    }
    return '$m분';
  }

  void _openTimerInput(String label, int current, ValueChanged<int> onChanged) {
    final ctrl = TextEditingController(text: '$current');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF13283A),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text('순환 · $label 시간',
            style: const TextStyle(color: Colors.white, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: ctrl,
              autofocus: true,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w700),
              decoration: const InputDecoration(
                suffixText: '분',
                suffixStyle: TextStyle(color: Colors.white54, fontSize: 16),
                enabledBorder: UnderlineInputBorder(
                    borderSide: BorderSide(color: Colors.white24)),
                focusedBorder: UnderlineInputBorder(
                    borderSide: BorderSide(color: _teal)),
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [1, 5, 10, 15, 30, 60, 120, 180]
                  .map((p) => GestureDetector(
                        onTap: () => ctrl.text = '$p',
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 7),
                          decoration: BoxDecoration(
                              color: Colors.white10,
                              borderRadius: BorderRadius.circular(20)),
                          child: Text(_fmtMin(p),
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 12)),
                        ),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 6),
            const Text('1 ~ 1440분 (최대 24시간)',
                style: TextStyle(color: Colors.white24, fontSize: 10)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('취소', style: TextStyle(color: Colors.white54)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _teal),
            onPressed: () {
              final v =
                  (int.tryParse(ctrl.text.trim()) ?? current).clamp(1, 1440);
              onChanged(v);
              Navigator.pop(ctx);
            },
            child: const Text('확인',
                style: TextStyle(color: _deep, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  Widget _connBtn(String label, ConnMode m, StateSetter setSheet) {
    final sel = api.mode == m;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          api.setMode(m);
          setSheet(() {});
        },
        child: Container(
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: sel ? _teal : Colors.white10,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(label,
              style: TextStyle(
                  color: sel ? _deep : Colors.white70,
                  fontWeight: sel ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 13)),
        ),
      ),
    );
  }

  void _openSettings() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF13283A),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
                20, 14, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
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
                        color: Colors.white24,
                        borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                const Text('설정',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                const Text('연결 방식',
                    style: TextStyle(color: Colors.white54, fontSize: 12)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    _connBtn('데모', ConnMode.demo, setSheet),
                    const SizedBox(width: 8),
                    _connBtn('블루투스', ConnMode.ble, setSheet),
                  ],
                ),
                const SizedBox(height: 14),
                if (api.mode == ConnMode.ble) ...[
                  const Text('블루투스로 B보드(AquaControl)를 검색·연결합니다.',
                      style: TextStyle(color: Colors.white54, fontSize: 12)),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                          backgroundColor: _teal,
                          padding: const EdgeInsets.symmetric(vertical: 14)),
                      onPressed: () => setSheet(() => api.setMode(ConnMode.ble)),
                      child: const Text('다시 검색',
                          style: TextStyle(
                              color: _deep, fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text('* 블루투스/위치 권한을 허용해야 검색됩니다.',
                      style: TextStyle(color: Colors.white38, fontSize: 11)),
                ] else ...[
                  const Text('ESP32 없이 가상 데이터로 UI를 확인합니다.',
                      style: TextStyle(color: Colors.white54, fontSize: 12)),
                ],
                const SizedBox(height: 20),
                const Divider(color: Colors.white12, height: 1),
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
                style: TextStyle(color: Colors.white54, fontSize: 12)),
            const Spacer(),
            if (updater.currentVersion.isNotEmpty)
              Text('현재 v${updater.currentVersion}',
                  style:
                      const TextStyle(color: Colors.white38, fontSize: 11.5)),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Colors.white24),
              padding: const EdgeInsets.symmetric(vertical: 13),
            ),
            icon: _checkingUpdate
                ? const SizedBox(
                    width: 15,
                    height: 15,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: _teal),
                  )
                : const Icon(Icons.system_update, color: _teal, size: 18),
            label: Text(_checkingUpdate ? '확인 중…' : '업데이트 확인',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600)),
            onPressed: _checkingUpdate
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
          ),
        ),
        if (_updateMsg != null) ...[
          const SizedBox(height: 8),
          Text(_updateMsg!,
              style: TextStyle(
                  color: updater.stage == UpdateStage.failed
                      ? const Color(0xFFF87171)
                      : _teal,
                  fontSize: 11.5)),
        ],
        if (!kUpdateConfigured) ...[
          const SizedBox(height: 8),
          const Text('* lib/updater.dart 의 GitHub 저장소를 설정해야 동작합니다.',
              style: TextStyle(color: Colors.white38, fontSize: 11)),
        ],
      ],
    );
  }
}
