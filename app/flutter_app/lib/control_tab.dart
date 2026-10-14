import 'package:flutter/material.dart';
import 'aqua_api.dart';
import 'models.dart';
import 'neo.dart';
import 'widgets.dart';

/// 제어 탭 — 히터 · 급수 펌프 · 순환 펌프
class ControlTab extends StatelessWidget {
  final AquaApi api;
  final VoidCallback onSettings;

  const ControlTab({super.key, required this.api, required this.onSettings});

  @override
  Widget build(BuildContext context) {
    final s = api.state;
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AquaHeader(
            title: '장치 제어',
            subtitle: '히터 수동 · 급수 · 순환 제어',
            mode: api.mode,
            connected: s.connected,
            onSettings: onSettings,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 26, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _heaterCard(context, s),
                const SizedBox(height: 18),
                _pump1Card(s),
                const SizedBox(height: 18),
                _pump2Card(context, s),
                if (api.isAquariumProfile) ...[
                  const SizedBox(height: 14),
                  const Text(
                      '현재 Aquarium 보드의 명령 규격은 확인 중입니다. 선택한 입력값과 보드가 보고한 상태를 구분해 표시합니다.',
                      style: TextStyle(fontSize: 12, color: Neo.sub)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ---------------- 카드 공통 ----------------

  Widget _deviceRow({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool? on,
  }) {
    return Row(
      children: [
        NeoInset(
          circle: true,
          depth: 4,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Icon(icon, size: 19, color: Neo.teal),
          ),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 15, color: Neo.ink)),
              const SizedBox(height: 3),
              Text(subtitle,
                  style: const TextStyle(fontSize: 11, color: Neo.sub)),
            ],
          ),
        ),
        Text(
            on == null
                ? '미수신'
                : api.isDemo
                    ? on
                        ? '작동 중'
                        : '대기'
                    : on
                        ? '보드 ON'
                        : '보드 OFF',
            style: TextStyle(
                fontSize: 12, color: on == true ? Neo.teal : Neo.sub)),
      ],
    );
  }

  // ---------------- 히터 ----------------

  Widget _heaterCard(BuildContext context, AquariumState s) {
    return NeoBox(
      radius: 24,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _deviceRow(
            icon: Icons.local_fire_department_outlined,
            title: '히터',
            subtitle: '수온 센서 제거 · 수동 켜기/끄기',
            on: api.hasValue('heaterOn') ? s.heaterOn : null,
          ),
          const SizedBox(height: 13),
          SlidingSegment(
            index: api.controlMode('heaterMode', s.heaterMode),
            labels: const ['끄기', '켜기'],
            onChanged: (m) => api.setValue('heaterMode', m),
          ),
          _feedback('heaterMode'),
          if (!api.isDemo && api.hasValue('heaterMode') && s.heaterMode == 2)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text('보드가 자동 모드를 보고합니다. 보드 펌웨어 설정을 확인해 주세요.',
                  style: TextStyle(fontSize: 11, color: Neo.sub)),
            ),
        ],
      ),
    );
  }

  // ---------------- 급수 펌프 ----------------

  Widget _pump1Card(AquariumState s) {
    return NeoBox(
      radius: 24,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _deviceRow(
            icon: Icons.water_drop_outlined,
            title: '급수 펌프',
            subtitle: api.isAquariumProfile ? '보드 보고 상태' : '수위 부족 시 자동 급수',
            on: api.hasValue('pump1On') ? s.pump1On : null,
          ),
          const SizedBox(height: 13),
          SlidingSegment(
            index: api.controlMode('pump1Mode', s.pump1Mode),
            labels: const ['끄기', '켜기', '자동'],
            onChanged: (m) => api.setValue('pump1Mode', m),
          ),
          _feedback('pump1Mode'),
        ],
      ),
    );
  }

  // ---------------- 순환 펌프 ----------------

  Widget _pump2Card(BuildContext context, AquariumState s) {
    return NeoBox(
      radius: 24,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _deviceRow(
            icon: Icons.sync,
            title: '순환 펌프',
            subtitle: '주기 반복 순환',
            on: api.hasValue('pump2On') ? s.pump2On : null,
          ),
          const SizedBox(height: 13),
          NeoInset(
            radius: 16,
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: IntrinsicHeight(
              child: Row(
                children: [
                  _cycleCell(
                      context,
                      '작동',
                      api.controlValue('circOn', s.circOn).toInt(),
                      Neo.teal,
                      (v) => api.setValue('circOn', v)),
                  Container(
                    width: 1,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    color: Neo.divider,
                  ),
                  _cycleCell(
                      context,
                      '휴식',
                      api.controlValue('circOff', s.circOff).toInt(),
                      Neo.ink,
                      (v) => api.setValue('circOff', v)),
                ],
              ),
            ),
          ),
          _feedback('circOn'),
          _feedback('circOff'),
          const SizedBox(height: 8),
          if (api.hasValue('circOn') && api.hasValue('circOff'))
            Text('${_fmtMin(s.circOn)} 켜고 → ${_fmtMin(s.circOff)} 끄기를 반복',
                style: const TextStyle(fontSize: 11, color: Neo.sub),
                textAlign: TextAlign.center),
          const SizedBox(height: 10),
          SlidingSegment(
            index: api.controlMode('pump2Mode', s.pump2Mode),
            labels: const ['끄기', '켜기', '자동'],
            onChanged: (m) => api.setValue('pump2Mode', m),
          ),
          _feedback('pump2Mode'),
        ],
      ),
    );
  }

  Widget _feedback(String key) => Padding(
        padding: EdgeInsets.only(top: 8),
        child: Text(api.isDemo ? '데모 설정' : api.controlFeedback(key),
            style: TextStyle(fontSize: 11, color: Neo.sub)),
      );

  Widget _cycleCell(BuildContext context, String label, int minutes,
      Color valueColor, ValueChanged<int> onChanged) {
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => _openTimerInput(context, label, minutes, onChanged),
        child: Column(
          children: [
            Text(label, style: const TextStyle(fontSize: 10, color: Neo.sub)),
            const SizedBox(height: 3),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_fmtMin(minutes),
                    style: TextStyle(
                        fontFamily: Neo.display,
                        fontSize: 15,
                        color: valueColor)),
                const SizedBox(width: 4),
                const Icon(Icons.edit, size: 11, color: Neo.sub),
              ],
            ),
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

  // ── 순환 타이머 직접 입력 (1~1440분) ──
  void _openTimerInput(BuildContext context, String label, int current,
      ValueChanged<int> onChanged) {
    final ctrl = TextEditingController(text: '$current');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Neo.bg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('순환 · $label 시간',
            style: const TextStyle(
                fontFamily: Neo.display, color: Neo.ink, fontSize: 17)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: ctrl,
              autofocus: true,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontFamily: Neo.display, color: Neo.teal, fontSize: 27),
              decoration: const InputDecoration(
                suffixText: '분',
                suffixStyle: TextStyle(color: Neo.sub, fontSize: 16),
                enabledBorder: UnderlineInputBorder(
                    borderSide: BorderSide(color: Neo.divider)),
                focusedBorder: UnderlineInputBorder(
                    borderSide: BorderSide(color: Neo.teal)),
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
                              color: Neo.divider,
                              borderRadius: BorderRadius.circular(20)),
                          child: Text(_fmtMin(p),
                              style: const TextStyle(
                                  color: Neo.ink, fontSize: 12)),
                        ),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 6),
            const Text('1 ~ 1440분 (최대 24시간)',
                style: TextStyle(color: Neo.sub, fontSize: 10)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('취소', style: TextStyle(color: Neo.sub)),
          ),
          TextButton(
            onPressed: () {
              final v = (int.tryParse(ctrl.text) ?? current).clamp(1, 1440);
              onChanged(v);
              Navigator.pop(ctx);
            },
            child: const Text('저장',
                style: TextStyle(color: Neo.teal, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}
