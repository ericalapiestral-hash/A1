import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

// ===================================================================
//  앱 자동 업데이트 (GitHub Releases)
//  -----------------------------------------------------------------
//  동작: GitHub Releases API로 최신 릴리스를 읽어 tag(v1.1.0)를 현재
//        앱 버전과 비교 → 새 버전이면 .apk 에셋을 내려받아 설치 화면 실행.
//  ※ 새 pub 패키지 없이 http + MethodChannel(MainActivity.kt) 로 구현.
// ===================================================================

/// ▼▼▼ 배포할 GitHub 저장소를 여기에 넣으세요 ▼▼▼
///     https://github.com/<owner>/<repo>  →  owner / repo
/// 릴리스를 만들 때 태그를 `v1.1.0` 처럼 붙이고 APK 파일을 첨부하면 됩니다.
const String kGithubOwner = 'YOUR_GITHUB_ID';
const String kGithubRepo = 'aqua-control';

/// 저장소가 아직 설정 전이면 업데이트 기능을 비활성화
bool get kUpdateConfigured =>
    kGithubOwner.isNotEmpty && kGithubOwner != 'YOUR_GITHUB_ID';

String get _releaseApi =>
    'https://api.github.com/repos/$kGithubOwner/$kGithubRepo/releases/latest';

enum UpdateStage {
  idle,
  checking,
  upToDate,
  available,
  downloading,
  readyToInstall,
  failed,
}

/// GitHub 릴리스 1건에서 뽑아낸 정보
class ReleaseInfo {
  final String version; // "1.1.0" (태그에서 v 제거)
  final String tag; // "v1.1.0"
  final String notes; // 릴리스 본문
  final String apkUrl; // APK 다운로드 주소
  final String apkName; // "AquaControl-1.1.0.apk"
  final int apkSize; // 바이트

  const ReleaseInfo({
    required this.version,
    required this.tag,
    required this.notes,
    required this.apkUrl,
    required this.apkName,
    required this.apkSize,
  });

  String get sizeText => apkSize <= 0
      ? ''
      : '${(apkSize / (1024 * 1024)).toStringAsFixed(1)} MB';
}

/// "v1.10.2" / "1.2" / "1.1.0-beta" 같은 표기를 비교.
/// a > b 면 1, 같으면 0, a < b 면 -1.
int compareVersions(String a, String b) {
  final pa = _versionParts(a);
  final pb = _versionParts(b);
  final n = pa.length > pb.length ? pa.length : pb.length;
  for (var i = 0; i < n; i++) {
    final x = i < pa.length ? pa[i] : 0;
    final y = i < pb.length ? pb[i] : 0;
    if (x != y) return x > y ? 1 : -1;
  }
  return 0;
}

List<int> _versionParts(String v) {
  // 앞의 'v' 등 문자 제거 후 숫자 구간만 추출: "v1.1.0-beta" -> [1,1,0]
  final m = RegExp(r'\d+').allMatches(v.split('+').first);
  return m.map((e) => int.parse(e.group(0)!)).toList();
}

class Updater extends ChangeNotifier {
  static const MethodChannel _ch = MethodChannel('aqua_control/updater');

  UpdateStage stage = UpdateStage.idle;
  String currentVersion = '';
  int currentBuild = 0;
  ReleaseInfo? latest;
  String? error;
  double progress = 0; // 0.0 ~ 1.0
  String? _downloadedPath;

  /// 한 번 실행되는 동안 자동 확인 팝업을 한 번만 띄우기 위한 플래그
  bool promptedThisSession = false;

  bool get supported => !kIsWeb && Platform.isAndroid;

  Future<void> loadCurrentVersion() async {
    if (!supported) return;
    try {
      final r = await _ch.invokeMapMethod<String, dynamic>('appVersion');
      currentVersion = (r?['versionName'] ?? '') as String;
      currentBuild = ((r?['versionCode'] ?? 0) as num).toInt();
    } catch (_) {
      currentVersion = '';
    }
    notifyListeners();
  }

  /// 최신 릴리스 확인. 새 버전이 있으면 [ReleaseInfo] 를, 없으면 null 반환.
  Future<ReleaseInfo?> check() async {
    if (!supported) {
      _fail('안드로이드에서만 지원합니다.');
      return null;
    }
    if (!kUpdateConfigured) {
      _fail('업데이트 저장소가 설정되지 않았습니다. (lib/updater.dart)');
      return null;
    }

    stage = UpdateStage.checking;
    error = null;
    notifyListeners();

    if (currentVersion.isEmpty) await loadCurrentVersion();

    try {
      final res = await http.get(
        Uri.parse(_releaseApi),
        headers: const {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'aqua-control-app',
        },
      ).timeout(const Duration(seconds: 15));

      if (res.statusCode == 404) {
        _fail('공개된 릴리스가 없습니다.');
        return null;
      }
      if (res.statusCode == 403) {
        _fail('GitHub 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.');
        return null;
      }
      if (res.statusCode != 200) {
        _fail('서버 응답 오류 (${res.statusCode})');
        return null;
      }

      final j = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final tag = (j['tag_name'] ?? '') as String;
      final assets = (j['assets'] as List?) ?? const [];

      Map<String, dynamic>? apk;
      for (final a in assets) {
        final m = a as Map<String, dynamic>;
        if (((m['name'] ?? '') as String).toLowerCase().endsWith('.apk')) {
          apk = m;
          break;
        }
      }
      if (tag.isEmpty || apk == null) {
        _fail('릴리스에 APK 파일이 첨부돼 있지 않습니다.');
        return null;
      }

      final info = ReleaseInfo(
        version: tag.replaceFirst(RegExp(r'^[vV]'), ''),
        tag: tag,
        notes: ((j['body'] ?? '') as String).trim(),
        apkUrl: apk['browser_download_url'] as String,
        apkName: apk['name'] as String,
        apkSize: ((apk['size'] ?? 0) as num).toInt(),
      );

      latest = info;
      final newer = compareVersions(info.version, currentVersion) > 0;
      stage = newer ? UpdateStage.available : UpdateStage.upToDate;
      notifyListeners();
      return newer ? info : null;
    } on TimeoutException {
      _fail('연결 시간이 초과됐습니다. 인터넷을 확인하세요.');
      return null;
    } catch (e) {
      _fail('업데이트 확인 실패: $e');
      return null;
    }
  }

  /// APK 다운로드. 성공하면 저장된 파일 경로 반환.
  Future<String?> download() async {
    final info = latest;
    if (info == null) return null;

    stage = UpdateStage.downloading;
    progress = 0;
    error = null;
    notifyListeners();

    IOSink? sink;
    try {
      final dir = await _ch.invokeMethod<String>('updateDir');
      if (dir == null) {
        _fail('저장 폴더를 만들 수 없습니다.');
        return null;
      }
      final file = File('$dir${Platform.pathSeparator}${info.apkName}');
      if (await file.exists()) await file.delete();

      final client = http.Client();
      try {
        final req = http.Request('GET', Uri.parse(info.apkUrl))
          ..headers['User-Agent'] = 'aqua-control-app';
        final res = await client.send(req).timeout(const Duration(seconds: 30));
        if (res.statusCode != 200) {
          _fail('다운로드 실패 (${res.statusCode})');
          return null;
        }

        final total = res.contentLength ?? info.apkSize;
        var received = 0;
        sink = file.openWrite();
        await for (final chunk in res.stream) {
          sink.add(chunk);
          received += chunk.length;
          if (total > 0) {
            final p = received / total;
            // 화면 갱신을 과하게 하지 않도록 0.5% 단위로만 알림
            if (p - progress >= 0.005 || p >= 1) {
              progress = p > 1 ? 1 : p;
              notifyListeners();
            }
          }
        }
        await sink.flush();
        await sink.close();
        sink = null;
      } finally {
        client.close();
      }

      _downloadedPath = file.path;
      progress = 1;
      stage = UpdateStage.readyToInstall;
      notifyListeners();
      return file.path;
    } on TimeoutException {
      _fail('다운로드 시간이 초과됐습니다.');
      return null;
    } catch (e) {
      _fail('다운로드 실패: $e');
      return null;
    } finally {
      try {
        await sink?.close();
      } catch (_) {}
    }
  }

  /// '출처를 알 수 없는 앱 설치' 권한 여부
  Future<bool> canInstall() async {
    if (!supported) return false;
    try {
      return await _ch.invokeMethod<bool>('canInstall') ?? false;
    } catch (_) {
      return false;
    }
  }

  /// 설치 권한 설정 화면 열기
  Future<void> openInstallPermission() async {
    if (!supported) return;
    try {
      await _ch.invokeMethod('requestInstallPermission');
    } catch (_) {}
  }

  /// 내려받은 APK 설치 화면 띄우기
  Future<bool> install() async {
    final path = _downloadedPath;
    if (path == null) return false;
    try {
      return await _ch.invokeMethod<bool>('install', {'path': path}) ?? false;
    } catch (e) {
      _fail('설치 실행 실패: $e');
      return false;
    }
  }

  void reset() {
    stage = UpdateStage.idle;
    progress = 0;
    error = null;
    notifyListeners();
  }

  void _fail(String msg) {
    error = msg;
    stage = UpdateStage.failed;
    notifyListeners();
  }
}
