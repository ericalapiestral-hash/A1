import 'dart:math';
import 'package:flutter/material.dart';

/// 원형 게이지 (값 변화 시 부드럽게 채워짐 + 글로우)
class CircularGauge extends StatelessWidget {
  final double value, min, max;
  final String display, unit, label;
  final Color color;
  final IconData icon;

  const CircularGauge({
    super.key,
    required this.value,
    required this.min,
    required this.max,
    required this.display,
    required this.unit,
    required this.label,
    required this.color,
    required this.icon,
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
                Icon(icon, color: color, size: 17),
                const SizedBox(height: 5),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(display,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 23,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.3)),
                    if (unit.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(left: 2),
                        child: Text(unit,
                            style: const TextStyle(
                                color: Colors.white54, fontSize: 11)),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(label,
                    style: const TextStyle(color: Colors.white60, fontSize: 11)),
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
    final radius = min(size.width, size.height) / 2 - 10;
    final rect = Rect.fromCircle(center: center, radius: radius);
    const start = 135 * pi / 180;
    const sweep = 270 * pi / 180;

    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 11
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.08);
    canvas.drawArc(rect, start, sweep, false, bg);

    if (fraction > 0) {
      final glow = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 11
        ..strokeCap = StrokeCap.round
        ..color = color.withOpacity(0.55)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
      canvas.drawArc(rect, start, sweep * fraction, false, glow);

      final fg = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 11
        ..strokeCap = StrokeCap.round
        ..shader = SweepGradient(
          startAngle: start,
          endAngle: start + sweep,
          colors: [color.withOpacity(0.45), color],
        ).createShader(rect);
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
        size: const Size(double.infinity, 34),
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
      final y = size.height - (v[i] - lo) / range * (size.height - 6) - 3;
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
          colors: [color.withOpacity(0.28), color.withOpacity(0.0)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(_SparkPainter old) => true;
}

/// 부드럽게 미끄러지는 세그먼트 토글 (끄기/켜기/자동)
class SlidingSegment extends StatelessWidget {
  final int index;
  final List<String> labels;
  final ValueChanged<int> onChanged;
  final Color color;

  const SlidingSegment({
    super.key,
    required this.index,
    required this.labels,
    required this.onChanged,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final segW = c.maxWidth / labels.length;
        return Container(
          height: 44,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Stack(
            children: [
              AnimatedPositioned(
                duration: const Duration(milliseconds: 240),
                curve: Curves.easeOutCubic,
                left: index * segW,
                top: 0,
                bottom: 0,
                width: segW,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Container(
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(9),
                      boxShadow: [
                        BoxShadow(
                          color: color.withOpacity(0.4),
                          blurRadius: 12,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
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
                            color: sel
                                ? const Color(0xFF06303A)
                                : Colors.white70,
                            fontWeight:
                                sel ? FontWeight.w700 : FontWeight.w500,
                            fontSize: 13,
                          ),
                          child: Text(labels[i]),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// 목표 수온 직접 입력 (− / 숫자입력 / +). 0.5 단위, 15~35℃.
class TempInput extends StatefulWidget {
  final double value;
  final ValueChanged<double> onChanged;
  final Color color;
  const TempInput({
    super.key,
    required this.value,
    required this.onChanged,
    required this.color,
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
    return Container(
      height: 40,
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _btn(Icons.remove, () => _bump(-0.5)),
          SizedBox(
            width: 52,
            child: TextField(
              controller: _c,
              focusNode: _focus,
              textAlign: TextAlign.center,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              style: TextStyle(
                color: widget.color,
                fontSize: 16,
                fontWeight: FontWeight.w700,
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
            padding: EdgeInsets.only(right: 4),
            child: Text('℃',
                style: TextStyle(color: Colors.white54, fontSize: 12)),
          ),
          _btn(Icons.add, () => _bump(0.5)),
        ],
      ),
    );
  }

  Widget _btn(IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(11),
        child: Container(
          width: 38,
          height: 40,
          alignment: Alignment.center,
          child: Icon(icon, size: 17, color: Colors.white70),
        ),
      );
}
