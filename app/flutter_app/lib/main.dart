import 'package:flutter/material.dart';
import 'dashboard.dart';
import 'neo.dart';

void main() => runApp(const AquaApp());

class AquaApp extends StatelessWidget {
  const AquaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '수조 컨트롤',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: ColorScheme.fromSeed(
          seedColor: Neo.teal,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: Neo.bg,
        fontFamily: Neo.body, // GowunDodum — 본문 기본
      ),
      home: const DashboardScreen(),
    );
  }
}
