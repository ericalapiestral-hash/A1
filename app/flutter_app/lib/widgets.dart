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
                        fontFamily: Neo.display,
                        fontSize: 26,
                        color: Neo.ink)),
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
                            style: const TextStyle(
                                color: Neo.sub, fontSize: 12)),
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

/// 추세 미니 그래프
class Sparkline extends StatelessWidget {
  final List<double> values;
  final Color color;
  const Sparkline({super.key, required this.values, required this.color});

  @override
  Widget build(BuildContext context) => CustomPaint(
        painter: _SparkPainter(List<double>.from(values), color),
        size: const Size(double.infinity, 52),
      );
}

class _SparkPainter extends CustomPainter {
  final List<double> v;
  final Color color;
  _SparkPainter(this.v, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    if (v.length < 2) return;
    final lo = v.reduce(min);
    final hi = v.reduce(max);
    final range = (hi - lo).abs() < 0.001 ? 1.0 : (hi - lo);

    Offset pt(int i) {
      final x = size.width * i / (v.length - 1);
      final y = size.height - (v[i] - lo) / range * (size.height - 8) - 4;
      return Offset(x, y);
    }

    final path = Path()..moveTo(pt(0).dx, pt(0).dy);
    for (int i = 1; i < v.length; i++) {
      path.lineTo(pt(i).dx, pt(i).dy);
    }
    final fill = Path.from(path)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            color.withValues(alpha: 0.22),
            color.withValues(alpha: 0.0)
          ],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(_SparkPainter old) => true;
}

/// 눌린 트랙 위를 튀어나온 썸이 미끄러지는 세그먼트 (끄기/켜기/자동)
class SlidingSegment extends StatelessWidget {
  final int index;
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
      child: SizedBox(
        height: 38,
        child: LayoutBuilder(
          builder: (context, c) {
            final segW = c.maxWidth / labels.length;
            return Stack(
              children: [
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 240),
                  curve: Curves.easeOutCubic,
                  left: index * segW,
                  top: 0,
                  bottom: 0,
                  width: segW,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: NeoBox(
                      radius: 11,
                      depth: 4,
                      child: const SizedBox.expand(),
                    ),
                  ),
                ),
                Row(
                  children: List.generate(labels.length, (i) {
                    final sel = i == index;
                    return Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => onChanged(i),
                        child: Center(
                          child: AnimatedDefaultTextStyle(
                            duration: const Duration(milliseconds: 200),
                            style: TextStyle(
                              fontFamily: sel ? Neo.display : Neo.body,
                              color: sel ? Neo.teal : Neo.sub,
                              fontSize: 12.5,
                            ),
                            child: Text(labels[i]),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// 목표 수온 직접 입력 (− / 숫자입력 / +). 0.5 단위, 15~35℃.
class TempInput extends StatefulWidget {
  final double value;
  final ValueChanged<double> onChanged;

  const TempInput({
    super.key,
    required this.value,
    required this.onChanged,
  });

  @override
  State<TempInput> createState() => _TempInputState();
}

class _TempInputState extends State<TempInput> {
  late final TextEditingController _c;
  late final FocusNode _focus;

  @override
  void initState() {
    super.initState();
    _c = TextEditingController(text: widget.value.toStringAsFixed(1));
    _focus = FocusNode();
    _focus.addListener(() {
      if (!_focus.hasFocus) _apply();
    });
  }

  @override
  void didUpdateWidget(TempInput old) {
    super.didUpdateWidget(old);
    // 외부에서 값이 바뀌고, 사용자가 편집 중이 아닐 때만 동기화
    if (!_focus.hasFocus &&
        widget.value != (double.tryParse(_c.text) ?? widget.value)) {
      _c.text = widget.value.toStringAsFixed(1);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    _focus.dispose();
    super.dispose();
  }

  double _clean(double v) {
    v = v.clamp(15.0, 35.0);
    return (v * 2).round() / 2; // 0.5 단위
  }

  void _apply() {
    final v = _clean(double.tryParse(_c.text) ?? widget.value);
    _c.text = v.toStringAsFixed(1);
    widget.onChanged(v);
  }

  void _bump(double d) {
    final v = _clean((double.tryParse(_c.text) ?? widget.value) + d);
    _c.text = v.toStringAsFixed(1);
    widget.onChanged(v);
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _btn(Icons.remove, Neo.sub, () => _bump(-0.5)),
        SizedBox(
          width: 58,
          child: TextField(
            controller: _c,
            focusNode: _focus,
            textAlign: TextAlign.center,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            style: const TextStyle(
              fontFamily: Neo.display,
              color: Neo.teal,
              fontSize: 17,
            ),
            decoration: const InputDecoration(
              isDense: true,
              contentPadding: EdgeInsets.zero,
              border: InputBorder.none,
            ),
            onSubmitted: (_) => _apply(),
            onEditingComplete: _apply,
          ),
        ),
        const Padding(
          padding: EdgeInsets.only(right: 8),
          child: Text('℃', style: TextStyle(color: Neo.sub, fontSize: 12)),
        ),
        _btn(Icons.add, Neo.teal, () => _bump(0.5)),
      ],
    );
  }

  Widget _btn(IconData icon, Color color, VoidCallback onTap) =>
      GestureDetector(
        onTap: onTap,
        child: NeoBox(
          radius: 11,
          depth: 4,
          padding: const EdgeInsets.all(8),
          child: Icon(icon, size: 15, color: color),
        ),
      );
}
