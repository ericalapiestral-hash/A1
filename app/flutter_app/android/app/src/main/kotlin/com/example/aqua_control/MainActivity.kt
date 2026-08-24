package com.example.aqua_control

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

// ===================================================================
//  앱 자동 업데이트용 네이티브 채널 (lib/updater.dart 와 짝)
//  - appVersion               현재 설치된 버전
//  - updateDir                APK 저장 폴더 (앱 전용 외부 저장소, 권한 불필요)
//  - canInstall               '출처를 알 수 없는 앱 설치' 허용 여부
//  - requestInstallPermission 위 권한 설정 화면 열기
//  - install(path)            내려받은 APK 설치 화면 실행
// ===================================================================
class MainActivity : FlutterActivity() {

    private companion object {
        const val CHANNEL = "aqua_control/updater"
        const val APK_MIME = "application/vnd.android.package-archive"
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "appVersion" -> result.success(appVersion())
                    "updateDir" -> result.success(updateDir().absolutePath)
                    "canInstall" -> result.success(canInstall())
                    "requestInstallPermission" -> {
                        openInstallPermissionSettings()
                        result.success(true)
                    }
                    "install" -> install(call.argument<String>("path"), result)
                    else -> result.notImplemented()
                }
            }
    }

    private fun appVersion(): Map<String, Any> {
        val info = packageManager.getPackageInfo(packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }
        return mapOf(
            "versionName" to (info.versionName ?: "0.0.0"),
            "versionCode" to code
        )
    }

    /** 앱 전용 외부 저장소 → 별도 저장소 권한이 필요 없고 앱 삭제 시 같이 지워짐 */
    private fun updateDir(): File {
        val dir = File(getExternalFilesDir(null), "updates")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun canInstall(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            packageManager.canRequestPackageInstalls()
        } else {
            true
        }

    private fun openInstallPermissionSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:$packageName")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivity(intent)
        } catch (e: Exception) {
            // 일부 기기엔 해당 화면이 없어 보안 설정 전체를 대신 연다
            startActivity(
                Intent(Settings.ACTION_SECURITY_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

    private fun install(path: String?, result: MethodChannel.Result) {
        if (path.isNullOrEmpty()) {
            result.error("no_path", "설치할 파일 경로가 없습니다.", null)
            return
        }
        val apk = File(path)
        if (!apk.exists()) {
            result.error("no_file", "파일을 찾을 수 없습니다: $path", null)
            return
        }
        try {
            val uri: Uri = FileProvider.getUriForFile(
                this, "$packageName.fileprovider", apk
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, APK_MIME)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            result.success(true)
        } catch (e: Exception) {
            result.error("install_failed", e.message ?: "설치 실행 실패", null)
        }
    }
}
