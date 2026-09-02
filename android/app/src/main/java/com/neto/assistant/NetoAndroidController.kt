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
        private val ALLOWED = setOf("open_app", "open_file", "open_url", "open_settings", "make_call", "compose_sms", "read_screen", "type_text", "tap", "long_press", "scroll", "swipe", "go_back", "go_home", "copy_text", "paste_text")
        fun result(ok: Boolean, message: String, choices: List<String> = emptyList()): String = JSONObject().put("ok", ok).put("message", message).put("choices", JSONArray(choices)).toString()
    }

    fun capabilities(): JSONObject = JSONObject().apply {
        put("androidControl", true)
        put("accessibility", NetoAccessibilityService.instance != null)
        put("contacts", has(Manifest.permission.READ_CONTACTS))
        put("microphone", has(Manifest.permission.RECORD_AUDIO))
        put("screenReading", NetoAccessibilityService.instance != null)
        put("screenCapture", false) // MediaProjection is intentionally not started silently.
        put("sms", true) // compose-only; Android Messages confirms sending.
    }

    fun execute(command: JSONObject): JSONObject {
        if (command.optString("type") != "android_action") return failure("Unsupported command type.")
        val action = command.optString("action")
        if (action !in ALLOWED) return failure("That Android action is not supported.")
        return when (action) {
            "open_app" -> openApp(command.optString("target"))
            "open_file" -> openFile(command.optString("target"))
            "open_url" -> openUrl(command.optString("url"))
            "open_settings" -> { activity.startActivity(Intent(Settings.ACTION_SETTINGS)); success("Opening Android Settings.") }
            "make_call" -> prepareCall(command.optString("target"))
            "compose_sms" -> composeSms(command.optString("target"), command.optString("text"))
            "read_screen" -> accessibility { readScreen() }
            "type_text" -> accessibility { typeText(command.optString("text")) }
            "tap" -> accessibility { activate(command.optString("target"), false) }
            "long_press" -> accessibility { activate(command.optString("target"), true) }
            "scroll", "swipe" -> accessibility { scroll(command.optString("direction", "down")) }
            "go_back" -> accessibility { globalBack() }
            "go_home" -> accessibility { globalHome() }
            "copy_text" -> accessibility { copy(command.optString("text")) }
            "paste_text" -> accessibility { paste() }
            else -> failure("That Android action is not supported.")
        }
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

    private fun openFile(target: String): JSONObject = try {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
        activity.startActivity(Intent.createChooser(intent, if (target.contains("download", true)) "Open a download" else "Open a file"))
        success("Opening Android's file picker.")
    } catch (_: Exception) { failure("I couldn't open the file picker.") }

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

    private fun accessibility(action: () -> JSONObject): JSONObject = if (NetoAccessibilityService.instance == null) failure("Enable NETO Android Control in Accessibility settings first.") else action()
    private fun has(permission: String) = ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED
    private fun success(message: String) = JSONObject(result(true, message))
    private fun failure(message: String) = JSONObject(result(false, message))
}
