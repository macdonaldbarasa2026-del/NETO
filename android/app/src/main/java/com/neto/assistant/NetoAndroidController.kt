package com.neto.assistant

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.provider.Settings
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Central Android action controller.
 *
 * Commands arrive as JSON data and are converted into a small allowlisted
 * NetoAction object before anything is executed.
 *
 * Consequential communication actions never silently send or place calls.
 * They open Android's user-controlled dialer or messaging composer.
 */
class NetoAndroidController(
    private val activity: MainActivity
) {

    companion object {
        private val ALLOWED_ACTIONS = setOf(
            "open_app",
            "list_apps",
            "search_contacts",
            "open_file",
            "open_url",
            "open_settings",
            "make_call",
            "compose_sms",
            "read_screen",
            "type_text",
            "tap",
            "long_press",
            "scroll",
            "swipe",
            "go_back",
            "go_home",
            "copy_text",
            "paste_text",
            "request_capability",
            "open_accessibility_settings",
            "open_app_settings"
        )

        fun result(
            ok: Boolean,
            message: String,
            choices: List<String> = emptyList(),
            code: String? = null
        ): String {
            return JSONObject()
                .put("ok", ok)
                .put("message", message)
                .put("choices", JSONArray(choices))
                .apply {
                    if (!code.isNullOrBlank()) {
                        put("code", code)
                    }
                }
                .toString()
        }

        fun successResult(message: String): JSONObject {
            return JSONObject(result(true, message))
        }

        fun failureResult(
            message: String,
            code: String? = null
        ): JSONObject {
            return JSONObject(result(false, message, code = code))
        }
    }

    private val capabilities = NetoCapabilityManager(activity)

    fun capabilities(): JSONObject {
        return capabilities.snapshot()
    }

    fun execute(command: JSONObject): JSONObject {
        val action = NetoAction.parse(command)
            ?: return failureResult(
                "That Android command is invalid or unsupported.",
                "INVALID_ACTION"
            )

        if (action.action !in ALLOWED_ACTIONS) {
            return failureResult(
                "That Android action is not supported.",
                "ACTION_NOT_ALLOWED"
            )
        }

        val result = when (action.action) {
            "open_app" ->
                openApp(action.target.orEmpty())

            "list_apps" ->
                listApps()

            "search_contacts" ->
                searchContacts(action.target.orEmpty())

            "open_file" ->
                openFile(action.target.orEmpty())

            "open_url" ->
                openUrl(action.url.orEmpty())

            "open_settings" ->
                openSettings(action.target.orEmpty())

            "make_call" ->
                prepareCall(action.target.orEmpty(), action.requestId)

            "compose_sms" ->
                composeSms(
                    action.target.orEmpty(),
                    action.text.orEmpty(),
                    action.requestId
                )

            "read_screen" ->
                accessibility { it.readScreen() }

            "type_text" ->
                accessibility {
                    it.typeText(action.text.orEmpty())
                }

            "tap" ->
                accessibility {
                    it.activate(action.target.orEmpty(), false)
                }

            "long_press" ->
                accessibility {
                    it.activate(action.target.orEmpty(), true)
                }

            "scroll" ->
                accessibility {
                    it.scroll(action.direction.orEmpty())
                }

            "swipe" ->
                accessibility {
                    it.swipe(action.direction.orEmpty())
                }

            "go_back" ->
                accessibility {
                    it.globalBack()
                }

            "go_home" ->
                accessibility {
                    it.globalHome()
                }

            "copy_text" ->
                accessibility {
                    it.copy(action.text.orEmpty())
                }

            "paste_text" ->
                accessibility {
                    it.paste()
                }

            "request_capability" ->
                requestCapability(action.target.orEmpty())

            "open_accessibility_settings" -> {
                activity.openAccessibilitySettings()
                success(
                    "Open NETO Accessibility Service in Android settings and enable it, then return to NETO.",
                    action.action,
                    action.requestId
                )
            }

            "open_app_settings" -> {
                activity.openAppSettings()
                success(
                    "Opening NETO app settings.",
                    action.action,
                    action.requestId
                )
            }

            else ->
                failure(
                    "That Android action is not supported.",
                    "ACTION_NOT_SUPPORTED",
                    action.action,
                    requestId = action.requestId
                )
        }

        if (!result.has("action")) {
            result.put("action", action.action)
        }

        if (!result.has("requestId") && !action.requestId.isNullOrBlank()) {
            result.put("requestId", action.requestId)
        }

        return result
    }

    private fun requestCapability(target: String): JSONObject {
        val normalized = target.trim().lowercase(Locale.US)

        if (normalized in setOf("accessibility", "accessibility_service")) {
            activity.openAccessibilitySettings()

            return success(
                "Open NETO Accessibility Service in Android settings and enable it, then return to NETO.",
                "request_capability"
            )
        }

        if (normalized in setOf("phone", "dialer", "calls")) {
            return success(
                "NETO uses the Android dialer for calls. Android will keep the final call control with you.",
                "request_capability"
            )
        }

        if (normalized in setOf("sms", "messages", "messaging")) {
            return success(
                "NETO uses the Android messaging composer. You control the final send action.",
                "request_capability"
            )
        }

        val alreadyGranted = when (normalized) {
            "microphone", "mic", "voice" ->
                activity.has(Manifest.permission.RECORD_AUDIO)

            "camera" ->
                activity.has(Manifest.permission.CAMERA)

            "contacts" ->
                activity.has(Manifest.permission.READ_CONTACTS)

            "location" ->
                activity.has(Manifest.permission.ACCESS_FINE_LOCATION) ||
                    activity.has(Manifest.permission.ACCESS_COARSE_LOCATION)

            "notifications", "notification" ->
                if (android.os.Build.VERSION.SDK_INT >= 33) {
                    activity.has(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    true
                }

            else -> null
        }

        if (alreadyGranted == null) {
            return failure(
                "I don't know how to request the $normalized capability.",
                "UNKNOWN_CAPABILITY",
                "request_capability"
            )
        }

        if (alreadyGranted) {
            return success(
                "$normalized access is already enabled.",
                "request_capability"
            )
        }

        activity.requestCapability(normalized)

        return success(
            "Android permission request opened for $normalized.",
            "request_capability"
        )
    }

    private fun openSettings(target: String): JSONObject {
        val normalized = target.trim().lowercase(Locale.US)

        val intent = when (normalized) {
            "wifi", "wi-fi", "wireless" ->
                Intent(Settings.ACTION_WIFI_SETTINGS)

            "bluetooth" ->
                Intent(Settings.ACTION_BLUETOOTH_SETTINGS)

            "notifications", "notification" ->
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(
                        Settings.EXTRA_APP_PACKAGE,
                        activity.packageName
                    )

            "accessibility" ->
                Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)

            "app", "application" ->
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${activity.packageName}")
                )

            "display" ->
                Intent(Settings.ACTION_DISPLAY_SETTINGS)

            "sound", "audio" ->
                Intent(Settings.ACTION_SOUND_SETTINGS)

            "location" ->
                Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)

            "battery" ->
                Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS)

            "date", "time", "date_time" ->
                Intent(Settings.ACTION_DATE_SETTINGS)

            "language", "input", "keyboard" ->
                Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)

            "", "settings" ->
                Intent(Settings.ACTION_SETTINGS)

            else ->
                return failure(
                    "I don't have a dedicated Android settings page for $target.",
                    "UNKNOWN_SETTINGS",
                    "open_settings"
                )
        }

        return try {
            activity.startActivity(intent)

            success(
                "Opening ${if (normalized.isBlank()) "Android" else normalized} settings.",
                "open_settings"
            )
        } catch (_: Exception) {
            failure(
                "Android settings are unavailable on this device.",
                "SETTINGS_UNAVAILABLE",
                "open_settings"
            )
        }
    }

    private fun openApp(target: String): JSONObject {
        if (target.length !in 1..80) {
            return failure(
                "Please name the app to open.",
                "INVALID_APP"
            )
        }

        val query = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)

        val matches = activity.packageManager
            .queryIntentActivities(
                query,
                PackageManager.MATCH_DEFAULT_ONLY
            )
            .filter {
                it.activityInfo.packageName != activity.packageName
            }
            .map {
                it to it.loadLabel(activity.packageManager).toString()
            }
            .filter { (_, label) ->
                label.equals(target, true) ||
                    label.contains(target, true)
            }

        if (matches.isEmpty()) {
            return failure(
                "$target isn't installed.",
                "APP_NOT_FOUND"
            )
        }

        val exact = matches.filter {
            it.second.equals(target, true)
        }

        val selected =
            if (exact.size == 1) {
                exact.first()
            } else if (matches.size == 1) {
                matches.first()
            } else {
                return JSONObject(
                    result(
                        false,
                        "I found multiple apps matching $target. Please choose one.",
                        matches.map { it.second }.distinct(),
                        "AMBIGUOUS_APP"
                    )
                ).put("action", "open_app")
            }

        val packageName = selected.first.activityInfo.packageName

        val launchIntent =
            activity.packageManager.getLaunchIntentForPackage(packageName)
                ?: return failure(
                    "$target can't be launched.",
                    "APP_NOT_LAUNCHABLE"
                )

        return try {
            activity.startActivity(launchIntent)

            success(
                "Opening ${selected.second}.",
                "open_app"
            )
        } catch (_: Exception) {
            failure(
                "I couldn't open ${selected.second}.",
                "APP_OPEN_FAILED",
                "open_app"
            )
        }
    }

    private fun openFile(target: String): JSONObject {
        return try {
            activity.openFilePicker(target)
        } catch (_: Exception) {
            failure(
                "I couldn't open the Android file picker.",
                "FILE_PICKER_FAILED",
                "open_file"
            )
        }
    }

    private fun openUrl(raw: String): JSONObject {
        val uri = runCatching {
            Uri.parse(raw.trim())
        }.getOrNull()
            ?: return failure(
                "That web address is invalid.",
                "INVALID_URL",
                "open_url"
            )

        if (
            uri.scheme !in setOf("http", "https") ||
            uri.host.isNullOrBlank()
        ) {
            return failure(
                "Only normal HTTP or HTTPS web addresses can be opened.",
                "UNSAFE_URL",
                "open_url"
            )
        }

        return try {
            activity.startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    uri
                ).addCategory(Intent.CATEGORY_BROWSABLE)
            )

            success(
                "Opening ${uri.host}.",
                "open_url"
            )
        } catch (_: Exception) {
            failure(
                "I couldn't open that web address.",
                "URL_OPEN_FAILED",
                "open_url"
            )
        }
    }

    private fun prepareCall(
        target: String,
        requestId: String?
    ): JSONObject {
        val resolved = resolveContact(target)
            ?: return failure(
                "I couldn't find $target in your contacts.",
                "CONTACT_NOT_FOUND",
                "make_call",
                requestId = requestId
            )

        if (resolved.numbers.size != 1) {
            return JSONObject(
                result(
                    false,
                    "I found multiple numbers for ${resolved.name}. Please choose one.",
                    resolved.numbers,
                    "MULTIPLE_NUMBERS"
                )
            ).put("action", "make_call")
                .put("requestId", requestId ?: JSONObject.NULL)
        }

        return try {
            activity.startActivity(
                Intent(
                    Intent.ACTION_DIAL,
                    Uri.parse(
                        "tel:${Uri.encode(resolved.numbers.first())}"
                    )
                )
            )

            NetoActionResult
                .confirmation(
                    "The Android dialer is ready to call ${resolved.name}. Review the number and press Call to confirm.",
                    "make_call",
                    requestId
                )
                .toJson()
        } catch (_: Exception) {
            failure(
                "I couldn't open the Android dialer.",
                "DIALER_UNAVAILABLE",
                "make_call",
                requestId = requestId
            )
        }
    }

    private fun composeSms(
        target: String,
        text: String,
        requestId: String?
    ): JSONObject {
        if (text.length !in 1..1600) {
            return failure(
                "Please provide a message between 1 and 1,600 characters.",
                "INVALID_MESSAGE",
                "compose_sms",
                requestId = requestId
            )
        }

        val resolved = resolveContact(target)
            ?: return failure(
                "I couldn't find $target in your contacts.",
                "CONTACT_NOT_FOUND",
                "compose_sms",
                requestId = requestId
            )

        if (resolved.numbers.size != 1) {
            return JSONObject(
                result(
                    false,
                    "I found multiple numbers for ${resolved.name}. Please choose one.",
                    resolved.numbers,
                    "MULTIPLE_NUMBERS"
                )
            ).put("action", "compose_sms")
                .put("requestId", requestId ?: JSONObject.NULL)
        }

        return try {
            val intent = Intent(
                Intent.ACTION_SENDTO,
                Uri.parse(
                    "smsto:${Uri.encode(resolved.numbers.first())}"
                )
            ).apply {
                putExtra("sms_body", text)
            }

            activity.startActivity(intent)

            NetoActionResult
                .confirmation(
                    "The Android messaging composer is ready for ${resolved.name}. Review the message and press Send to confirm.",
                    "compose_sms",
                    requestId
                )
                .toJson()
        } catch (_: Exception) {
            failure(
                "I couldn't open the Android messaging composer.",
                "SMS_COMPOSER_UNAVAILABLE",
                "compose_sms",
                requestId = requestId
            )
        }
    }

    private fun searchContacts(query: String): JSONObject {
        if (query.length !in 1..80) {
            return failure(
                "Please provide a contact name or number.",
                "INVALID_CONTACT_QUERY",
                "search_contacts"
            )
        }

        if (!activity.has(Manifest.permission.READ_CONTACTS)) {
            activity.requestCapability("contacts")

            return failure(
                "Contacts permission is required before NETO can search your contacts.",
                "CONTACTS_PERMISSION_REQUIRED",
                "search_contacts"
            )
        }

        val results = mutableListOf<String>()

        activity.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            ),
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ? OR " +
                "${ContactsContract.CommonDataKinds.Phone.NUMBER} LIKE ?",
            arrayOf("%$query%", "%$query%"),
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                results += "${cursor.getString(0)}: ${cursor.getString(1)}"
            }
        }

        return if (results.isEmpty()) {
            failure(
                "No contacts found for $query.",
                "CONTACT_NOT_FOUND",
                "search_contacts"
            )
        } else {
            JSONObject(
                result(
                    true,
                    "Found ${results.distinct().size} contact result(s).",
                    results.distinct()
                )
            ).put("action", "search_contacts")
        }
    }

    private fun listApps(): JSONObject {
        val query = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)

        val apps = activity.packageManager
            .queryIntentActivities(
                query,
                PackageManager.MATCH_DEFAULT_ONLY
            )
            .filter {
                it.activityInfo.packageName != activity.packageName
            }
            .map {
                it.loadLabel(activity.packageManager).toString()
            }
            .filter { it.isNotBlank() }
            .distinct()
            .sortedWith(String.CASE_INSENSITIVE_ORDER)

        return JSONObject(
            result(
                true,
                "Found ${apps.size} installed apps.",
                apps
            )
        ).put("action", "list_apps")
    }

    private data class Contact(
        val name: String,
        val numbers: List<String>
    )

    private fun resolveContact(target: String): Contact? {
        if (
            target.matches(
                Regex("^[+0-9() -]{3,32}$")
            )
        ) {
            return Contact(
                target,
                listOf(target)
            )
        }

        if (!activity.has(Manifest.permission.READ_CONTACTS)) {
            activity.requestCapability("contacts")
            return null
        }

        val contacts = mutableListOf<Contact>()

        activity.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            ),
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
            arrayOf("%$target%"),
            null
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                contacts += Contact(
                    cursor.getString(0),
                    listOf(cursor.getString(1))
                )
            }
        }

        val grouped = contacts
            .groupBy { it.name }
            .map { (name, entries) ->
                Contact(
                    name,
                    entries
                        .flatMap { it.numbers }
                        .distinct()
                )
            }

        return if (grouped.size == 1) {
            grouped.first()
        } else {
            null
        }
    }

    private fun accessibility(
        action: (NetoAccessibilityService) -> JSONObject
    ): JSONObject {
        val service = NetoAccessibilityService.instance

        if (!activity.isNetoAccessibilityEnabled() || service == null) {
            return failure(
                "Enable NETO Accessibility Service in Android Accessibility settings first.",
                "ACCESSIBILITY_REQUIRED"
            )
        }

        return try {
            action(service)
        } catch (_: Exception) {
            failure(
                "NETO couldn't complete that accessibility action.",
                "ACCESSIBILITY_ACTION_FAILED"
            )
        }
    }

    private fun success(
        message: String,
        action: String? = null,
        requestId: String? = null
    ): JSONObject {
        return NetoActionResult
            .success(
                message,
                action,
                requestId
            )
            .toJson()
    }

    private fun failure(
        message: String,
        code: String? = null,
        action: String? = null,
        choices: List<String> = emptyList(),
        requestId: String? = null
    ): JSONObject {
        return NetoActionResult
            .failure(
                message,
                code,
                action,
                choices,
                requestId
            )
            .toJson()
    }
}
