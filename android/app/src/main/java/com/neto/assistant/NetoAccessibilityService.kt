package com.neto.assistant

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

/**
 * NETO's Android interaction engine.
 *
 * This service is only active after the user explicitly enables NETO
 * in Android Accessibility settings.
 *
 * It provides:
 * - screen inspection
 * - text extraction
 * - focused-field detection
 * - text entry
 * - tap
 * - long press
 * - scroll
 * - real swipe gestures
 * - back/home
 * - clipboard operations
 * - structured screen context
 */
class NetoAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: NetoAccessibilityService? = null
            private set
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: android.view.accessibility.AccessibilityEvent?) {
        if (event == null) return

        /*
         * Keep this lightweight.
         *
         * The native service does not continuously send the entire screen
         * to the cloud. Screen data is collected only when NETO explicitly
         * requests it.
         */
    }

    override fun onInterrupt() = Unit

    fun readScreen(): JSONObject {
        val root = rootInActiveWindow
            ?: return failure(
                "The current screen is not available.",
                "SCREEN_UNAVAILABLE"
            )

        val nodes = mutableListOf<ScreenNode>()
        collectNodes(root, nodes)

        val visible = nodes
            .filter { it.text.isNotBlank() || it.description.isNotBlank() }
            .distinctBy {
                "${it.text}|${it.description}|${it.className}|${it.bounds}"
            }
            .take(250)

        val result = JSONObject()
            .put("packageName", root.packageName?.toString().orEmpty())
            .put("className", root.className?.toString().orEmpty())
            .put("nodeCount", visible.size)

        val elements = JSONArray()

        visible.forEach { node ->
            elements.put(
                JSONObject()
                    .put("text", node.text)
                    .put("description", node.description)
                    .put("className", node.className)
                    .put("resourceId", node.resourceId)
                    .put("clickable", node.clickable)
                    .put("editable", node.editable)
                    .put("scrollable", node.scrollable)
                    .put("enabled", node.enabled)
                    .put("bounds", node.bounds)
            )
        }

        result.put("elements", elements)

        return ok(
            "Screen read successfully.",
            result
        )
    }

    fun typeText(text: String): JSONObject {
        if (text.isBlank()) {
            return failure("Please provide text to type.", "TEXT_REQUIRED")
        }

        if (text.length > 8000) {
            return failure("That text is too long.", "TEXT_TOO_LONG")
        }

        val root = rootInActiveWindow
            ?: return failure(
                "The current screen is unavailable.",
                "SCREEN_UNAVAILABLE"
            )

        val node = focusedEditable(root)
            ?: findEditable(root)

        if (node == null) {
            return failure(
                "I couldn't find an editable text field.",
                "EDITABLE_FIELD_NOT_FOUND"
            )
        }

        val args = Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                text
            )
        }

        val success = node.performAction(
            AccessibilityNodeInfo.ACTION_SET_TEXT,
            args
        )

        return if (success) {
            ok("Text entered.")
        } else {
            failure(
                "Android did not accept the text.",
                "TEXT_ENTRY_FAILED"
            )
        }
    }

    fun activate(
        selector: String,
        longPress: Boolean
    ): JSONObject {
        if (selector.isBlank()) {
            return failure(
                "Please specify the screen element.",
                "SELECTOR_REQUIRED"
            )
        }

        if (selector.length > 200) {
            return failure(
                "That screen selector is too long.",
                "SELECTOR_TOO_LONG"
            )
        }

        val root = rootInActiveWindow
            ?: return failure(
                "The current screen is unavailable.",
                "SCREEN_UNAVAILABLE"
            )

        val node = findBestNode(root, selector)
            ?: return failure(
                "I couldn't find \"$selector\" on this screen.",
                "ELEMENT_NOT_FOUND"
            )

        val target = clickableParent(node) ?: node

        val action =
            if (longPress) {
                AccessibilityNodeInfo.ACTION_LONG_CLICK
            } else {
                AccessibilityNodeInfo.ACTION_CLICK
            }

        if (target.performAction(action)) {
            return ok(
                if (longPress) {
                    "Long-pressed $selector."
                } else {
                    "Tapped $selector."
                }
            )
        }

        /*
         * Some applications expose visible controls that do not properly
         * implement ACTION_CLICK. Fall back to a real screen gesture.
         */
        val bounds = Rect()
        target.getBoundsInScreen(bounds)

        if (bounds.isEmpty) {
            return failure(
                "The element has no usable screen position.",
                "ELEMENT_BOUNDS_UNAVAILABLE"
            )
        }

        return if (dispatchTap(bounds, longPress)) {
            ok(
                if (longPress) {
                    "Long-pressed $selector."
                } else {
                    "Tapped $selector."
                }
            )
        } else {
            failure(
                "Android could not interact with \"$selector\".",
                "INTERACTION_FAILED"
            )
        }
    }

    fun scroll(direction: String): JSONObject {
        val normalized = direction.lowercase()

        val root = rootInActiveWindow
            ?: return failure(
                "The current screen is unavailable.",
                "SCREEN_UNAVAILABLE"
            )

        val node = scrollable(root)
            ?: return failure(
                "I couldn't find a scrollable area.",
                "SCROLL_AREA_NOT_FOUND"
            )

        val action = when (normalized) {
            "up", "left" ->
                AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD

            "down", "right" ->
                AccessibilityNodeInfo.ACTION_SCROLL_FORWARD

            else ->
                return failure(
                    "Supported directions are up, down, left and right.",
                    "INVALID_DIRECTION"
                )
        }

        if (node.performAction(action)) {
            return ok("Scrolled $normalized.")
        }

        return failure(
            "That screen did not accept the scroll action.",
            "SCROLL_FAILED"
        )
    }

    fun swipe(direction: String): JSONObject {
        val normalized = direction.lowercase()

        if (normalized !in setOf("up", "down", "left", "right")) {
            return failure(
                "Supported directions are up, down, left and right.",
                "INVALID_DIRECTION"
            )
        }

        val displayMetrics = resources.displayMetrics

        val width = displayMetrics.widthPixels.toFloat()
        val height = displayMetrics.heightPixels.toFloat()

        val centerX = width / 2f
        val centerY = height / 2f

        val distanceX = width * 0.32f
        val distanceY = height * 0.28f

        val startX: Float
        val startY: Float
        val endX: Float
        val endY: Float

        when (normalized) {
            "up" -> {
                startX = centerX
                startY = centerY + distanceY
                endX = centerX
                endY = centerY - distanceY
            }

            "down" -> {
                startX = centerX
                startY = centerY - distanceY
                endX = centerX
                endY = centerY + distanceY
            }

            "left" -> {
                startX = centerX + distanceX
                startY = centerY
                endX = centerX - distanceX
                endY = centerY
            }

            else -> {
                startX = centerX - distanceX
                startY = centerY
                endX = centerX + distanceX
                endY = centerY
            }
        }

        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(
                GestureDescription.StrokeDescription(
                    path,
                    0L,
                    450L
                )
            )
            .build()

        val accepted = dispatchGesture(
            gesture,
            null,
            mainHandler
        )

        return if (accepted) {
            ok("Swiped $normalized.")
        } else {
            failure(
                "Android rejected the swipe gesture.",
                "SWIPE_FAILED"
            )
        }
    }

    fun globalBack(): JSONObject {
        return if (performGlobalAction(GLOBAL_ACTION_BACK)) {
            ok("Went back.")
        } else {
            failure(
                "Android could not go back.",
                "BACK_FAILED"
            )
        }
    }

    fun globalHome(): JSONObject {
        return if (performGlobalAction(GLOBAL_ACTION_HOME)) {
            ok("Went home.")
        } else {
            failure(
                "Android could not go home.",
                "HOME_FAILED"
            )
        }
    }

    fun copy(text: String): JSONObject {
        if (text.isBlank()) {
            return failure(
                "Please provide text to copy.",
                "TEXT_REQUIRED"
            )
        }

        if (text.length > 8000) {
            return failure(
                "That text is too long.",
                "TEXT_TOO_LONG"
            )
        }

        val clipboard =
            getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

        clipboard.setPrimaryClip(
            ClipData.newPlainText(
                "NETO",
                text
            )
        )

        return ok("Copied text.")
    }

    fun paste(): JSONObject {
        val clipboard =
            getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

        val clip = clipboard.primaryClip
            ?: return failure(
                "Your clipboard is empty.",
                "CLIPBOARD_EMPTY"
            )

        if (clip.itemCount == 0) {
            return failure(
                "Your clipboard is empty.",
                "CLIPBOARD_EMPTY"
            )
        }

        val value = clip
            .getItemAt(0)
            .coerceToText(this)
            .toString()

        if (value.isBlank()) {
            return failure(
                "The clipboard does not contain usable text.",
                "CLIPBOARD_TEXT_EMPTY"
            )
        }

        return typeText(value)
    }

    private fun findBestNode(
        root: AccessibilityNodeInfo,
        selector: String
    ): AccessibilityNodeInfo? {
        val normalized = selector.trim()

        val byText = root
            .findAccessibilityNodeInfosByText(normalized)
            .firstOrNull()

        if (byText != null) {
            return byText
        }

        val nodes = mutableListOf<AccessibilityNodeInfo>()
        collectRawNodes(root, nodes)

        return nodes.firstOrNull { node ->
            val text = node.text?.toString().orEmpty()
            val description = node.contentDescription?.toString().orEmpty()
            val resource = node.viewIdResourceName.orEmpty()

            text.equals(normalized, true) ||
                description.equals(normalized, true) ||
                resource.equals(normalized, true) ||
                text.contains(normalized, true) ||
                description.contains(normalized, true)
        }
    }

    private fun clickableParent(
        node: AccessibilityNodeInfo
    ): AccessibilityNodeInfo? {
        var current: AccessibilityNodeInfo? = node

        repeat(8) {
            if (current == null) return@repeat

            if (current!!.isClickable || current!!.isLongClickable) {
                return current
            }

            current = current!!.parent
        }

        return null
    }

    private fun focusedEditable(
        node: AccessibilityNodeInfo?
    ): AccessibilityNodeInfo? {
        if (node == null) return null

        if (node.isFocused && node.isEditable) {
            return node
        }

        for (index in 0 until node.childCount) {
            val result = focusedEditable(node.getChild(index))
            if (result != null) return result
        }

        return null
    }

    private fun findEditable(
        node: AccessibilityNodeInfo?
    ): AccessibilityNodeInfo? {
        if (node == null) return null

        if (node.isEditable && node.isEnabled) {
            return node
        }

        for (index in 0 until node.childCount) {
            val result = findEditable(node.getChild(index))
            if (result != null) return result
        }

        return null
    }

    private fun scrollable(
        node: AccessibilityNodeInfo?
    ): AccessibilityNodeInfo? {
        if (node == null) return null

        if (node.isScrollable) {
            return node
        }

        for (index in 0 until node.childCount) {
            val result = scrollable(node.getChild(index))
            if (result != null) return result
        }

        return null
    }

    private fun collectRawNodes(
        node: AccessibilityNodeInfo?,
        output: MutableList<AccessibilityNodeInfo>
    ) {
        if (node == null) return

        output += node

        for (index in 0 until node.childCount) {
            collectRawNodes(
                node.getChild(index),
                output
            )
        }
    }

    private fun collectNodes(
        node: AccessibilityNodeInfo?,
        output: MutableList<ScreenNode>
    ) {
        if (node == null) return

        val bounds = Rect()
        node.getBoundsInScreen(bounds)

        output += ScreenNode(
            text = node.text?.toString().orEmpty(),
            description = node.contentDescription?.toString().orEmpty(),
            className = node.className?.toString().orEmpty(),
            resourceId = node.viewIdResourceName.orEmpty(),
            clickable = node.isClickable,
            editable = node.isEditable,
            scrollable = node.isScrollable,
            enabled = node.isEnabled,
            bounds = bounds.toShortString()
        )

        for (index in 0 until node.childCount) {
            collectNodes(
                node.getChild(index),
                output
            )
        }
    }

    private fun dispatchTap(
        bounds: Rect,
        longPress: Boolean
    ): Boolean {
        val x = bounds.centerX().toFloat()
        val y = bounds.centerY().toFloat()

        val path = Path().apply {
            moveTo(x, y)
        }

        val duration = if (longPress) 650L else 60L

        val gesture = GestureDescription.Builder()
            .addStroke(
                GestureDescription.StrokeDescription(
                    path,
                    0L,
                    duration
                )
            )
            .build()

        return dispatchGesture(
            gesture,
            null,
            mainHandler
        )
    }

    private fun ok(
        message: String,
        data: JSONObject? = null
    ): JSONObject {
        return JSONObject(
            NetoAndroidController.result(
                true,
                message
            )
        ).apply {
            data?.let {
                put("data", it)
            }
        }
    }

    private fun failure(
        message: String,
        code: String
    ): JSONObject {
        return JSONObject(
            NetoAndroidController.result(
                false,
                message,
                code = code
            )
        )
    }

    private data class ScreenNode(
        val text: String,
        val description: String,
        val className: String,
        val resourceId: String,
        val clickable: Boolean,
        val editable: Boolean,
        val scrollable: Boolean,
        val enabled: Boolean,
        val bounds: String
    )
}
