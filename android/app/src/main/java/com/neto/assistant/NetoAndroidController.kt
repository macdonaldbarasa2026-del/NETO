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
 * Central allowlisted controller. Commands are data, not executable code:
 * there is no reflection, shell, root access, arbitrary Intent URI parsing, or JS evaluation.
 */
class NetoAndroidController(private val activity: MainActivity) {
    companion object {
        private val ALLOWED = setOf("open_app", "open_file", "open_url", "open_settings", "make_call", "compose_sms", "read_screen", "type_text", "tap", "long_press", "scroll", "swipe", "go_back", "go_home", "copy_text", "paste_text", "request_capability", "open_accessibility_settings", "open_app_settings", "search_contacts", "list_apps")
        fun result(ok: Boolean, message: String, choices: List<String> = emptyList(), code: String? = null): String = JSONObject().put("ok", ok).put("message", message).put("choices", JSONArray(choices)).apply { if (code != null) put("code", code) }.toString()
        fun successResult(message: String) = JSONObject(result(true, message))
        fun failureResult(message: String, code: String? = null) = JSONObject(result(false, message, code = code))
    }

    fun capabilities(): JSONObject = JSONObject().apply {
        put("androidControl", true)
        put("accessibility", accessibilityEnabled())
        put("accessibilityConnected", NetoAccessibilityService.instance != null)
        put("contacts", has(Manifest.permission.READ_CONTACTS))
        put("microphone", has(Manifest.permission.RECORD_AUDIO))
        put("microphonePermanentlyDenied", activity.permanentlyDenied(Manifest.permission.RECORD_AUDIO))
        put("camera", has(Manifest.permission.CAMERA))
        put("contactsPermanentlyDenied", activity.permanentlyDenied(Manifest.permission.READ_CONTACTS))
        put("notifications", if (android.os.Build.VERSION.SDK_INT >= 33) has(Manifest.permission.POST_NOTIFICATIONS) else true)
        put("phone", activity.packageManager.resolveActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:0")), 0) != null)
        put("screenReading", NetoAccessibilityService.instance != null)
        put("voiceRecognition", android.speech.SpeechRecognizer.isRecognitionAvailable(activity))
        put("textToSpeech", activity.isTextToSpeechReady())
        put("internet", activity.isInternetAvailable())
        put("files", activity.packageManager.resolveActivity(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*"), 0) != null)
        put("screenCapture", false) // MediaProjection is intentionally not started silently.
        put("sms", true) // compose-only; Android Messages confirms sending.
    }

    fun execute(command: JSONObject): JSONObject {
        if (command.optString("type") != "android_action") return failure("Unsupported command type.")
        val action = command.optString("action")
        if (action !in ALLOWED) return failure("That Android action is not supported.")
        val outcome = when (action) {
            "open_app" -> openApp(command.optString("target"))
            "open_file" -> openFile(command.optString("target"))
            "open_url" -> openUrl(command.optString("url"))
            "open_settings" -> openSettings(command.optString("target"))
            "request_capability" -> activity.requestCapability(command.optString("target"))
            "open_accessibility_settings" -> { activity.openAccessibilitySettings(); success("Open NETO Accessibility Service and enable it, then return here.") }
            "open_app_settings" -> { activity.openAppSettings(); success("Opening NETO app settings.") }
            "make_call" -> prepareCall(command.optString("target"))
            "compose_sms" -> composeSms(command.optString("target"), command.optString("text"))
            "read_screen" -> accessibility { it.readScreen() }
            "type_text" -> accessibility { it.typeText(command.optString("text")) }
            "tap" -> accessibility { it.activate(command.optString("target"), false) }
            "long_press" -> accessibility { it.activate(command.optString("target"), true) }
            "scroll", "swipe" -> accessibility { it.scroll(command.optString("direction", "down")) }
            "go_back" -> accessibility { it.globalBack() }
            "go_home" -> accessibility { it.globalHome() }
            "copy_text" -> accessibility { it.copy(command.optString("text")) }
            "paste_text" -> accessibility { it.paste() }
            "search_contacts" -> searchContacts(command.optString("query"))
            "list_apps" -> listApps()
            else -> failure("That Android action is not supported.")
        }
        return outcome.put("action", action)
    }

    private fun openSettings(target: String): JSONObject {
        val normalized = target.trim().lowercase(Locale.US)
        val intent = when (normalized) {
            "wifi", "wi-fi", "wireless" -> Intent(Settings.ACTION_WIFI_SETTINGS)
            "bluetooth" -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
            "notifications", "notification" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
            "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            "app", "application" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
            "display" -> Intent(Settings.ACTION_DISPLAY_SETTINGS)
            "sound", "audio" -> Intent(Settings.ACTION_SOUND_SETTINGS)
            "location" -> Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
            "battery" -> Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS)
            "date", "time", "date_time" -> Intent(Settings.ACTION_DATE_SETTINGS)
            "language", "input", "keyboard" -> Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)
            else -> Intent(Settings.ACTION_SETTINGS)
        }
        return try { activity.startActivity(intent); success("Opening ${if (normalized.isBlank()) "Android" else normalized} settings.") }
        catch (_: Exception) { failure("Android settings are unavailable on this device.") }
    }

    private fun openApp(target: String): JSONObject {
        if (target.length !in 1..80) return failure("Please name the app to open.")
        val query = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val matches = activity.packageManager.queryIntentActivities(query, 0)
            .filter { it.activityInfo.packageName != activity.packageName }
            .map { it to it.loadLabel(activity.packageManager).toString() }
            .filter { (_, label) -> label.equals(target, true) || label.contains(target, true) }
        if (matches.isEmpty()) return failure("$target isn't installed.")
        val exact = matches.filter { it.second.equals(target, true) }
        val selected = if (exact.size == 1) exact.first() else if (matches.size == 1) matches.first() else return JSONObject(result(false, "I found multiple apps named $target. Please choose one.", matches.map { it.second }.distinct()))
        val intent = activity.packageManager.getLaunchIntentForPackage(selected.first.activityInfo.packageName) ?: return failure("$target can't be launched.")
        return try { activity.startActivity(intent); success("Opening ${selected.second}.") } catch (_: Exception) { failure("I couldn't open ${selected.second}.") }
    }

    private fun openFile(target: String): JSONObject = activity.openFilePicker(target)

    private fun openUrl(raw: String): JSONObject {
        val uri = runCatching { Uri.parse(raw) }.getOrNull() ?: return failure("That web address is invalid.")
        if (uri.scheme !in setOf("https", "http") || uri.host.isNullOrBlank()) return failure("Only normal web addresses can be opened.")
        return try { activity.startActivity(Intent(Intent.ACTION_VIEW, uri)); success("Opening ${uri.host}.") } catch (_: Exception) { failure("I couldn't open that web address.") }
    }

    private fun prepareCall(target: String): JSONObject {
        val resolved = resolveContact(target) ?: return failure("I couldn't find $target in your contacts.")
        if (resolved.numbers.size != 1) return JSONObject(result(false, "I found multiple numbers for ${resolved.name}. Please choose one.", resolved.numbers))
        return try { activity.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(resolved.numbers.first())}"))); success("Ready to call ${resolved.name}. Confirm the call in Android.") } catch (_: Exception) { failure("I couldn't prepare that call.") }
    }

    private fun composeSms(target: String, text: String): JSONObject {
        if (text.length !in 1..1600) return failure("Please provide a message under 1,600 characters.")
        val resolved = resolveContact(target) ?: return failure("I couldn't find $target in your contacts.")
        if (resolved.numbers.size != 1) return JSONObject(result(false, "I found multiple numbers for ${resolved.name}. Please choose one.", resolved.numbers))
        return try { activity.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${Uri.encode(resolved.numbers.first())}")).putExtra("sms_body", text)); success("Message prepared for ${resolved.name}. Confirm sending in Android Messages.") } catch (_: Exception) { failure("I couldn't prepare that message.") }
    }

    private fun searchContacts(query: String): JSONObject {
        if (query.length !in 1..80) return failure("Please provide a contact name or number.")
        if (!has(Manifest.permission.READ_CONTACTS)) { activity.requestCapability("contacts"); return failure("Contacts permission is required.") }
        val results = mutableListOf<String>()
        activity.contentResolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER), "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ? OR ${ContactsContract.CommonDataKinds.Phone.NUMBER} LIKE ?", arrayOf("%$query%", "%$query%"), "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC")?.use { cursor -> while (cursor.moveToNext()) results += "${cursor.getString(0)}: ${cursor.getString(1)}" }
        return if (results.isEmpty()) failure("No contacts found for $query.") else JSONObject(result(true, "Found ${results.size} contact result(s).", results.distinct()))
    }

    private fun listApps(): JSONObject {
        val query = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val apps = activity.packageManager.queryIntentActivities(query, 0).filter { it.activityInfo.packageName != activity.packageName }.map { it.loadLabel(activity.packageManager).toString() }.distinct().sortedWith(String.CASE_INSENSITIVE_ORDER)
        return JSONObject(result(true, "Found ${apps.size} installed apps.", apps))
    }
    private data class Contact(val name: String, val numbers: List<String>)
    private fun resolveContact(target: String): Contact? {
        if (target.matches(Regex("^[+0-9() -]{3,32}$"))) return Contact(target, listOf(target))
        if (!has(Manifest.permission.READ_CONTACTS)) { activity.requestCapability("contacts"); return null }
        val contacts = mutableListOf<Contact>()
        activity.contentResolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER), "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?", arrayOf("%$target%"), null)?.use { c ->
            while (c.moveToNext()) contacts += Contact(c.getString(0), listOf(c.getString(1)))
        }
        val grouped = contacts.groupBy { it.name }.map { Contact(it.key, it.value.flatMap { item -> item.numbers }.distinct()) }
        return if (grouped.size == 1) grouped.first() else null
    }

    private fun accessibility(action: (NetoAccessibilityService) -> JSONObject): JSONObject { val service = NetoAccessibilityService.instance; return if (!accessibilityEnabled() || service == null) failure("Enable NETO Accessibility Service in Android Accessibility settings first.") else action(service) }
    private fun accessibilityEnabled(): Boolean = android.provider.Settings.Secure.getString(activity.contentResolver, android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)?.split(':')?.any { it.equals("${activity.packageName}/.NetoAccessibilityService", true) || it.equals("${activity.packageName}/com.neto.assistant.NetoAccessibilityService", true) } == true
    private fun has(permission: String) = ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED
    private fun success(message: String) = JSONObject(result(true, message))
    private fun failure(message: String) = JSONObject(result(false, message))
}
