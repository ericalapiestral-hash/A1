// 수조 컨트롤 앱 기본 스모크 테스트
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aqua_control/main.dart';

void main() {
  testWidgets('앱이 빌드되고 헤더가 보인다', (WidgetTester tester) async {
    await tester.pumpWidget(const AquaApp());
    await tester.pump();
    expect(find.text('수조 컨트롤'), findsOneWidget);
    // 화면 종료로 주기 타이머를 정리하고 지연 업데이트 작업을 끝낸다.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 3));
  });
}
