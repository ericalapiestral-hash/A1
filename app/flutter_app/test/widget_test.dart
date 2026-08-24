// 수조 컨트롤 앱 기본 스모크 테스트
import 'package:flutter_test/flutter_test.dart';

import 'package:aqua_control/main.dart';

void main() {
  testWidgets('앱이 빌드되고 헤더가 보인다', (WidgetTester tester) async {
    await tester.pumpWidget(const AquaApp());
    await tester.pump();
    expect(find.text('수조 컨트롤'), findsOneWidget);
  });
}
