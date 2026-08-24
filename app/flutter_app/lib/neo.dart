import 'package:flutter/material.dart';

/// C 시안(웜 네오모피즘) 디자인 토큰.
/// 배경에서 살짝 튀어나오거나(NeoBox) 눌린(NeoInset) 입체감이 핵심.
class Neo {
  Neo._();

  static const Color bg = Color(0xFFF7F5F1); // 웜화이트 바탕
  static const Color shadowDark = Color(0xFFDED8CB); // 그림자(어두운 쪽)
  static const Color shadowLight = Color(0xFFFFFFFF); // 그림자(밝은 쪽)
  static const Color ink = Color(0xFF1B1D20); // 본문 텍스트
  static const Color sub = Color(0xFF8A8F98); // 보조 텍스트
  static const Color teal = Color(0xFF0F766E); // 단일 악센트
  static const Color tealSoft = Color(0x8C0F766E); // 틸 55% (pH 게이지)
  static const Color divider = Color(0xFFE8E4DB);
  static const Color warn = Color(0xFFC94F3D); // 수위 부족 등 경고

  static const String display = 'Jua'; // 제목·숫자 (둥글고 통통)
  static const String body = 'GowunDodum'; // 본문·라벨 (부드러운 라운드)
}

/// 튀어나온(raised) 네오모피즘 컨테이너.
class NeoBox extends StatelessWidget {
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry? padding;
  final double depth; // 그림자 오프셋(px). 카드 7, 칩/버튼 4~5.

  const NeoBox({
    super.key,
    required this.child,
    this.radius = 24,
    this.padding,
    this.depth = 7,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: Neo.bg,
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
              color: Neo.shadowDark,
              offset: Offset(depth, depth),
              blurRadius: depth * 2.3),
          BoxShadow(
              color: Neo.shadowLight,
              offset: Offset(-depth, -depth),
              blurRadius: depth * 2.3),
        ],
      ),
      child: child,
    );
  }
}

/// 눌린(inset) 네오모피즘 컨테이너.
/// Flutter 의 BoxShadow 에는 inset 이 없어 CustomPainter 로 안쪽 그림자를 그린다.
class NeoInset extends StatelessWidget {
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry padding;
  final bool circle;
  final double depth;

  const NeoInset({
    super.key,
    required this.child,
    this.radius = 16,
    this.padding = EdgeInsets.zero,
    this.circle = false,
    this.depth = 4,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _InsetPainter(radius: radius, circle: circle, depth: depth),
      child: Padding(padding: padding, child: child),
    );
  }
}

class _InsetPainter extends CustomPainter {
  final double radius;
  final bool circle;
  final double depth;
  _InsetPainter({required this.radius, required this.circle, required this.depth});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final r = circle ? size.shortestSide / 2 : radius;
    final rrect = RRect.fromRectAndRadius(rect, Radius.circular(r));

    canvas.drawRRect(rrect, Paint()..color = Neo.bg);

    canvas.save();
    canvas.clipRRect(rrect);
    final outer = Path()
      ..addRect(Rect.fromLTWH(-40, -40, size.width + 80, size.height + 80));

    // 좌상단 안쪽에 어두운 그림자
    final darkRing = Path.combine(
      PathOperation.difference,
      outer,
      Path()..addRRect(rrect.shift(Offset(depth, depth))),
    );
    canvas.drawPath(
      darkRing,
      Paint()
        ..color = Neo.shadowDark
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, depth + 1.5),
    );

    // 우하단 안쪽에 밝은 하이라이트
    final lightRing = Path.combine(
      PathOperation.difference,
      outer,
      Path()..addRRect(rrect.shift(Offset(-depth, -depth))),
    );
    canvas.drawPath(
      lightRing,
      Paint()
        ..color = Neo.shadowLight
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, depth + 1.5),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_InsetPainter old) =>
      old.radius != radius || old.circle != circle || old.depth != depth;
}
