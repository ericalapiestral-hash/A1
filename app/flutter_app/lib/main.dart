import 'package:flutter/material.dart';
import 'dashboard.dart';

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
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0E7C86),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0B1722),
        fontFamily: 'Roboto',
      ),
      home: const DashboardScreen(),
    );
  }
}
