package com.neto.assistant

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = true
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(NetoBridge(this, webView), "NetoNative")
        webView.loadUrl(BuildConfig.NETO_ORIGIN)
    }

    fun requestCapability(permission: String) {
        val permissions = when (permission) {
            "contacts" -> arrayOf(Manifest.permission.READ_CONTACTS)
            "microphone" -> arrayOf(Manifest.permission.RECORD_AUDIO)
            "notifications" -> arrayOf(Manifest.permission.POST_NOTIFICATIONS)
            else -> emptyArray()
        }
        if (permissions.isNotEmpty()) permissionLauncher.launch(permissions)
    }

    fun openAccessibilitySettings() = startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    fun openAppSettings() = startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
