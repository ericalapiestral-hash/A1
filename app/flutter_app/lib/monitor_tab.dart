import 'package:flutter/material.dart';
import 'aqua_api.dart';
import 'models.dart';
import 'neo.dart';
import 'widgets.dart';

/// 모니터링 탭 — 수온/pH 게이지 + 탁도·조도·수위 + 수온 추이
class MonitorTab extends StatelessWidget {
  final AquaApi api;
  final VoidCallback onSettings;

  const MonitorTab({super.key, required this.api, required this.onSettings});

  @override
  Widget build(BuildContext context) {
    final s = api.state;
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AquaHeader(
            title: '수조 컨트롤',
            subtitle: '실시간 모니터링 · 자동 제어',
            mode: api.mode,
            connected: s.connected,
            onSettings: onSettings,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 26, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _gaugeCard(
                        label: '수온',
                        gauge: CircularGauge(
                          value: s.temp,
                          min: 15,
                          max: 35,
                          display: s.temp.toStringAsFixed(1),
                          unit: '℃',
                          subtitle: '목표 ${s.tempSet.toStringAsFixed(1)}',
                          color: Neo.teal,
                        ),
                      ),
                    ),
                    const SizedBox(width: 18),
                    Expanded(
                      child: _gaugeCard(
                        label: 'pH 산성도',
                        gauge: CircularGauge(
                          value: s.ph,
                          min: 0,
                          max: 14,
                          display: s.ph.toStringAsFixed(2),
                          unit: '',
                          subtitle: _phText(s.ph),
                          color: Neo.tealSoft,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                _miniStats(s),
                const SizedBox(height: 18),
                _trendCard(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _phText(double ph) {
    if (ph < 6.5) return '산성 주의';
    if (ph > 7.5) return '알칼리 주의';
    return '중성 범위';
  }

  Widget _gaugeCard({required String label, required Widget gauge}) {
    return NeoBox(
      radius: 26,
      padding: const EdgeInsets.fromLTRB(12, 18, 12, 16),
      child: Column(
        children: [
          NeoInset(
            circle: true,
            depth: 6,
            child: SizedBox(width: 128, height: 128, child: gauge),
          ),
          const SizedBox(height: 10),
          Text(label, style: const TextStyle(fontSize: 12, color: Neo.sub)),
        ],
      ),
    );
  }

  Widget _miniStats(AquariumState s) {
    return NeoBox(
      radius: 24,
      child: IntrinsicHeight(
        child: Row(
          children: [
            _miniCell('탁도', s.turb.toStringAsFixed(0), 'NTU', Neo.ink),
            _vDivider(),
            _miniCell('조도', s.lux.toStringAsFixed(0), '%', Neo.ink),
            _vDivider(),
            _miniCell('수위', s.level == 1 ? '정상' : '부족', '',
                s.level == 1 ? Neo.teal : Neo.warn),
          ],
        ),
      ),
    );
  }

  Widget _vDivider() => Container(
        width: 1,
        margin: const EdgeInsets.symmetric(vertical: 14),
        color: Neo.divider,
      );

  Widget _miniCell(String label, String value, String unit, Color color) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          children: [
            Text(label, style: const TextStyle(fontSize: 10, color: Neo.sub)),
            const SizedBox(height: 4),
            Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontFamily: Neo.display, fontSize: 17, color: color)),
                if (unit.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(left: 3),
                    child: Text(unit,
                        style:
                            const TextStyle(fontSize: 10, color: Neo.sub)),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _trendCard() {
    final h = api.tempHistory;
    String rangeText = '';
    if (h.length >= 2) {
      final lo = h.reduce((a, b) => a < b ? a : b);
      final hi = h.reduce((a, b) => a > b ? a : b);
      rangeText = '${lo.toStringAsFixed(1)} ~ ${hi.toStringAsFixed(1)}℃';
    }
    return NeoBox(
      radius: 24,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Text('수온 추이',
                  style: TextStyle(fontSize: 12, color: Neo.sub)),
              const Spacer(),
              Text(rangeText,
                  style: const TextStyle(
                      fontFamily: Neo.display,
                      fontSize: 12,
                      color: Neo.teal)),
            ],
          ),
          const SizedBox(height: 12),
          NeoInset(
            radius: 16,
            padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
            child: SizedBox(
              height: 52,
              child: Sparkline(values: h, color: Neo.teal),
            ),
          ),
        ],
      ),
    );
  }
}
