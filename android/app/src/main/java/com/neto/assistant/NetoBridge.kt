package com.neto.assistant

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/** The only JavaScript-exposed native entry point. It accepts validated JSON, never method names. */
class NetoBridge(private val activity: MainActivity, private val webView: WebView) {
    private fun trustedPage(): Boolean = webView.url?.let { it == BuildConfig.NETO_ORIGIN || it.startsWith("${BuildConfig.NETO_ORIGIN}/") } == true

    @JavascriptInterface
    fun execute(raw: String): String {
        if (!trustedPage()) return NetoAndroidController.result(false, "NETO Android control is unavailable on this page.")
        return try { NetoAndroidController(activity).execute(JSONObject(raw)).toString() }
        catch (_: Exception) { NetoAndroidController.result(false, "That Android command was invalid.") }
    }

    @JavascriptInterface fun startVoice(language: String): String = if (trustedPage()) activity.startVoice(language).toString() else NetoAndroidController.failureResult("NETO voice is unavailable on this page.").toString()
    @JavascriptInterface fun stopVoice(): String = activity.stopVoice().toString()
    @JavascriptInterface fun speak(text: String, rate: Double): String = if (trustedPage()) activity.speak(text, rate.toFloat()).toString() else NetoAndroidController.failureResult("NETO voice is unavailable on this page.").toString()
    @JavascriptInterface fun stopSpeaking(): String = activity.stopSpeaking().toString()

    @JavascriptInterface
    fun getCapabilityStatus(): String {
        if (!trustedPage()) return "{}"
        return NetoAndroidController(activity).capabilities().toString()
    }
}
