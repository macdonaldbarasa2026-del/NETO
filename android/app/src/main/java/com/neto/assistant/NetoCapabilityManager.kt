package com.neto.assistant

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import org.json.JSONObject

class NetoCapabilityManager(
    private val activity: MainActivity
) {
    fun snapshot(): JSONObject {
        return JSONObject().apply {
            put("androidControl", true)

            put("microphone", granted(Manifest.permission.RECORD_AUDIO))
            put(
                "microphonePermanentlyDenied",
                activity.permanentlyDenied(Manifest.permission.RECORD_AUDIO)
            )

            put("camera", granted(Manifest.permission.CAMERA))
            put(
                "cameraPermanentlyDenied",
                activity.permanentlyDenied(Manifest.permission.CAMERA)
            )

            put("contacts", granted(Manifest.permission.READ_CONTACTS))
            put(
                "contactsPermanentlyDenied",
                activity.permanentlyDenied(Manifest.permission.READ_CONTACTS)
            )

            val location =
                granted(Manifest.permission.ACCESS_FINE_LOCATION) ||
                granted(Manifest.permission.ACCESS_COARSE_LOCATION)

            put("location", location)

            put(
                "locationPermanentlyDenied",
                activity.permanentlyDenied(Manifest.permission.ACCESS_FINE_LOCATION) &&
                    activity.permanentlyDenied(Manifest.permission.ACCESS_COARSE_LOCATION)
            )

            put(
                "notifications",
                if (Build.VERSION.SDK_INT >= 33) {
                    granted(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    true
                }
            )

            put(
                "accessibility",
                activity.isNetoAccessibilityEnabled()
            )

            put(
                "accessibilityConnected",
                NetoAccessibilityService.instance != null
            )

            put(
                "internet",
                activity.isInternetAvailable()
            )

            put(
                "voiceRecognition",
                android.speech.SpeechRecognizer.isRecognitionAvailable(activity)
            )

            put(
                "textToSpeech",
                activity.isTextToSpeechReady()
            )

            put(
                "files",
                activity.packageManager
                    .resolveActivity(
                        android.content.Intent(
                            android.content.Intent.ACTION_OPEN_DOCUMENT
                        ).setType("*/*"),
                        PackageManager.MATCH_DEFAULT_ONLY
                    ) != null
            )

            // NETO intentionally uses the Android dialer and SMS composer.
            // It does not silently place calls or silently send SMS.
            put("phoneDialer", true)
            put("directCall", false)
            put("smsCompose", true)
            put("directSms", false)

            put("screenCapture", false)
        }
    }

    fun request(permissionName: String): Boolean {
        val permission = when (permissionName.lowercase()) {
            "microphone", "mic", "voice" ->
                Manifest.permission.RECORD_AUDIO

            "camera" ->
                Manifest.permission.CAMERA

            "contacts" ->
                Manifest.permission.READ_CONTACTS

            "location" ->
                Manifest.permission.ACCESS_FINE_LOCATION

            "notifications", "notification" ->
                if (Build.VERSION.SDK_INT >= 33) {
                    Manifest.permission.POST_NOTIFICATIONS
                } else {
                    return true
                }

            else -> return false
        }

        if (granted(permission)) {
            return true
        }

        activity.requestCapability(permissionName)
        return false
    }

    private fun granted(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(
            activity,
            permission
        ) == PackageManager.PERMISSION_GRANTED
    }
}
