package com.neto.assistant

import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/**
 * Single JavaScript bridge exposed to the trusted NETO origin.
 *
 * No reflection.
 * No shell execution.
 * No arbitrary native method names.
 * No arbitrary JavaScript execution.
 */
class NetoBridge(
    private val activity: MainActivity,
    private val webView: WebView
) {

    private fun trustedPage(): Boolean {
        val current = webView.url ?: return false

        return try {
            val currentUri = Uri.parse(current)
            val trustedUri = Uri.parse(BuildConfig.NETO_ORIGIN)

            currentUri.scheme.equals(trustedUri.scheme, true) &&
                currentUri.host.equals(trustedUri.host, true) &&
                currentUri.port == trustedUri.port
        } catch (_: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun execute(raw: String): String {
        if (!trustedPage()) {
            return NetoAndroidController.result(
                false,
                "NETO Android control is unavailable on this page.",
                code = "UNTRUSTED_PAGE"
            )
        }

        return try {
            val command = JSONObject(raw)

            NetoAndroidController(activity)
                .execute(command)
                .toString()
        } catch (_: Exception) {
            NetoAndroidController.result(
                false,
                "That Android command was invalid.",
                code = "INVALID_COMMAND"
            )
        }
    }

    @JavascriptInterface
    fun startVoice(language: String): String {
        if (!trustedPage()) {
            return NetoAndroidController.failureResult(
                "NETO voice is unavailable on this page.",
                "UNTRUSTED_PAGE"
            ).toString()
        }

        return activity
            .startVoice(language)
            .toString()
    }

    @JavascriptInterface
    fun stopVoice(): String {
        if (!trustedPage()) {
            return NetoAndroidController.failureResult(
                "NETO voice is unavailable on this page.",
                "UNTRUSTED_PAGE"
            ).toString()
        }

        return activity
            .stopVoice()
            .toString()
    }

    @JavascriptInterface
    fun speak(
        text: String,
        rate: Double
    ): String {
        if (!trustedPage()) {
            return NetoAndroidController.failureResult(
                "NETO speech is unavailable on this page.",
                "UNTRUSTED_PAGE"
            ).toString()
        }

        return activity
            .speak(text, rate.toFloat())
            .toString()
    }

    @JavascriptInterface
    fun stopSpeaking(): String {
        if (!trustedPage()) {
            return NetoAndroidController.failureResult(
                "NETO speech is unavailable on this page.",
                "UNTRUSTED_PAGE"
            ).toString()
        }

        return activity
            .stopSpeaking()
            .toString()
    }

    @JavascriptInterface
    fun getCapabilityStatus(): String {
        if (!trustedPage()) {
            return "{}"
        }

        return NetoAndroidController(activity)
            .capabilities()
            .toString()
    }
}
