import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aqua_control/monitor_tab.dart';
import 'package:aqua_control/aqua_api.dart';
import 'package:aqua_control/neo.dart';

void main() {
  Future<void> measure(WidgetTester tester, double width) async {
    await tester.binding.setSurfaceSize(Size(width, 800));
    tester.view.devicePixelRatio = 1.0;
    final api = AquaApi();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: MonitorTab(api: api, onSettings: () {})),
    ));
    await tester.pump(const Duration(milliseconds: 700));

    final circleInsets =
        find.byWidgetPredicate((w) => w is NeoInset && w.circle);
    final sizes = circleInsets.evaluate().map((e) => e.size).toList();
    // Also measure the CustomPaint directly under each circular NeoInset.
    // ignore: avoid_print
    print('SCREEN ${width}dp -> circular NeoInset render sizes: $sizes');
    for (final el in circleInsets.evaluate()) {
      final rb = el.renderObject as RenderBox;
      // ignore: avoid_print
      print('  inset box: ${rb.size.width} x ${rb.size.height} '
          'square=${rb.size.width == rb.size.height}');
    }
  }

  testWidgets('gauge well geometry at common widths', (tester) async {
    await measure(tester, 412);
    await measure(tester, 390);
    await measure(tester, 384);
    await measure(tester, 375);
    await measure(tester, 370);
    await measure(tester, 360);
    await measure(tester, 320);
    await tester.binding.setSurfaceSize(null);
  });
}
