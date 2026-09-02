package com.neto.assistant

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

/** Active only after the user enables it in Android Accessibility settings. */
class NetoAccessibilityService : AccessibilityService() {
    companion object { var instance: NetoAccessibilityService? = null; private set }
    override fun onServiceConnected() { instance = this }
    override fun onDestroy() { instance = null; super.onDestroy() }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit

    fun readScreen(): JSONObject {
        val text = collect(rootInActiveWindow).joinToString(" ").trim().take(4000)
        return if (text.isBlank()) fail("I couldn't read visible text on this screen.") else ok("On your screen: $text")
    }

    fun typeText(text: String): JSONObject {
        if (text.isBlank() || text.length > 4000) return fail("Please provide text to type.")
        val node = focusedEditable(rootInActiveWindow) ?: return fail("I couldn't find a focused text field.")
        val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) }
        return if (node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) ok("Text entered.") else fail("Android didn't accept text in that field.")
    }

    fun activate(selector: String, longPress: Boolean): JSONObject {
        if (selector.length !in 1..160) return fail("Please name the screen element.")
        val node = findByText(rootInActiveWindow, selector) ?: return fail("I couldn't find $selector on this screen.")
        val action = if (longPress) AccessibilityNodeInfo.ACTION_LONG_CLICK else AccessibilityNodeInfo.ACTION_CLICK
        return if (clickableParent(node)?.performAction(action) == true) ok(if (longPress) "Long-pressed $selector." else "Tapped $selector.") else fail("Android couldn't interact with $selector.")
    }

    fun scroll(direction: String): JSONObject {
        val node = scrollable(rootInActiveWindow) ?: return fail("I couldn't find a scrollable area.")
        val action = when (direction) { "up", "left" -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD; "down", "right" -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD; else -> return fail("That scroll direction isn't supported.") }
        return if (node.performAction(action)) ok("Scrolled $direction.") else fail("That screen can't scroll $direction.")
    }
    fun globalBack() = if (performGlobalAction(GLOBAL_ACTION_BACK)) ok("Went back.") else fail("Android couldn't go back.")
    fun globalHome() = if (performGlobalAction(GLOBAL_ACTION_HOME)) ok("Went home.") else fail("Android couldn't go home.")
    fun copy(text: String): JSONObject {
        if (text.isBlank() || text.length > 4000) return fail("Please provide text to copy.")
        (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("NETO", text))
        return ok("Copied text.")
    }
    fun paste(): JSONObject {
        val clip = (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip ?: return fail("Your clipboard is empty.")
        return typeText(clip.getItemAt(0).coerceToText(this).toString())
    }

    private fun collect(node: AccessibilityNodeInfo?): List<String> {
        if (node == null) return emptyList()
        val own = listOfNotNull(node.text?.toString(), node.contentDescription?.toString()).filter { it.isNotBlank() }
        return own + (0 until node.childCount).flatMap { collect(node.getChild(it)) }
    }
    private fun focusedEditable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isFocused && node.isEditable) return node
        return (0 until node.childCount).firstNotNullOfOrNull { focusedEditable(node.getChild(it)) }
    }
    private fun findByText(root: AccessibilityNodeInfo?, text: String): AccessibilityNodeInfo? = root?.findAccessibilityNodeInfosByText(text)?.firstOrNull()
    private fun clickableParent(node: AccessibilityNodeInfo): AccessibilityNodeInfo? { var current: AccessibilityNodeInfo? = node; while (current != null && !current.isClickable && !current.isLongClickable) current = current.parent; return current }
    private fun scrollable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? { if (node == null) return null; if (node.isScrollable) return node; return (0 until node.childCount).firstNotNullOfOrNull { scrollable(node.getChild(it)) } }
    private fun ok(message: String) = JSONObject(NetoAndroidController.result(true, message))
    private fun fail(message: String) = JSONObject(NetoAndroidController.result(false, message))
}
