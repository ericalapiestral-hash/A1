import 'dart:math';
import 'package:flutter/material.dart';
import 'aqua_api.dart';
import 'neo.dart';

/// 두 탭이 함께 쓰는 상단 헤더 (제목 + 연결 칩 + 설정 버튼)
class AquaHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final ConnMode mode;
  final bool connected;
  final VoidCallback onSettings;

  const AquaHeader({
    super.key,
    required this.title,
    required this.subtitle,
    required this.mode,
    required this.connected,
    required this.onSettings,
  });

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;
    late final Color chipColor;
    late final String chipText;
    switch (mode) {
      case ConnMode.demo:
        chipColor = const Color(0xFFC08A2E);
        chipText = '데모 모드';
        break;
      case ConnMode.ble:
        chipColor = connected ? Neo.teal : const Color(0xFFC08A2E);
        chipText = connected ? '블루투스' : 'BT 검색중';
        break;
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(24, topPad + 18, 16, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontFamily: Neo.display, fontSize: 26, color: Neo.ink)),
                const SizedBox(height: 5),
                Text(subtitle,
                    style: const TextStyle(fontSize: 12, color: Neo.sub)),
              ],
            ),
          ),
          NeoBox(
            radius: 999,
            depth: 5,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration:
                      BoxDecoration(color: chipColor, shape: BoxShape.circle),
                ),
                const SizedBox(width: 7),
                Text(chipText,
                    style: TextStyle(fontSize: 11, color: chipColor)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: onSettings,
            child: NeoBox(
              radius: 999,
              depth: 5,
              padding: const EdgeInsets.all(9),
              child:
                  const Icon(Icons.settings_outlined, size: 19, color: Neo.sub),
            ),
          ),
        ],
      ),
    );
  }
}

/// 원형 게이지 — 네오 우물(NeoInset 원) 안에 놓이는 270° 아크
class CircularGauge extends StatelessWidget {
  final double value, min, max;
  final String display, unit, subtitle;
  final Color color;

  const CircularGauge({
    super.key,
    required this.value,
    required this.min,
    required this.max,
    required this.display,
    required this.unit,
    required this.subtitle,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final frac = ((value - min) / (max - min)).clamp(0.0, 1.0);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: frac),
      duration: const Duration(milliseconds: 650),
      curve: Curves.easeOutCubic,
      builder: (context, f, _) {
        return CustomPaint(
          painter: _GaugePainter(f, color),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(display,
                        style: const TextStyle(
                            fontFamily: Neo.display,
                            color: Neo.ink,
                            fontSize: 26)),
                    if (unit.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(left: 2),
                        child: Text(unit,
                            style:
                                const TextStyle(color: Neo.sub, fontSize: 12)),
                      ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(subtitle,
                    style: const TextStyle(color: Neo.sub, fontSize: 10)),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _GaugePainter extends CustomPainter {
  final double fraction;
  final Color color;
  _GaugePainter(this.fraction, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = min(size.width, size.height) / 2 - 9;
    final rect = Rect.fromCircle(center: center, radius: radius);
    const start = 135 * pi / 180;
    const sweep = 270 * pi / 180;

    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 7
      ..strokeCap = StrokeCap.round
      ..color = Neo.shadowDark.withValues(alpha: 0.55);
    canvas.drawArc(rect, start, sweep, false, bg);

    if (fraction > 0) {
      final fg = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 7
        ..strokeCap = StrokeCap.round
        ..color = color;
      canvas.drawArc(rect, start, sweep * fraction, false, fg);
    }
  }

  @override
  bool shouldRepaint(_GaugePainter old) =>
      old.fraction != fraction || old.color != color;
}

/// 눌린 트랙 위를 튀어나온 썸이 미끄러지는 세그먼트 (끄기/켜기/자동)
class SlidingSegment extends StatelessWidget {
  final int? index;
  final List<String> labels;
  final ValueChanged<int> onChanged;

  const SlidingSegment({
    super.key,
    required this.index,
    required this.labels,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return NeoInset(
      radius: 15,
      padding: const EdgeInsets.all(5),
      child: Row(
        children: List.generate(labels.length, (i) {
          final selected = i == index;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: TextButton(
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 44),
                  foregroundColor: selected ? Neo.teal : Neo.ink,
                  backgroundColor: selected ? Neo.bg : Colors.transparent,
                  side: BorderSide(color: selected ? Neo.teal : Neo.divider),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                ),
                onPressed: () => onChanged(i),
                child: Text(labels[i],
                    style: TextStyle(
                      fontFamily: selected ? Neo.display : Neo.body,
                      fontSize: 12.5,
                    )),
              ),
            ),
          );
        }),
      ),
    );
  }
}
