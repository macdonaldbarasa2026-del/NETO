package com.neto.assistant

import org.json.JSONObject

data class NetoAction(
    val action: String,
    val target: String? = null,
    val text: String? = null,
    val url: String? = null,
    val direction: String? = null,
    val requestId: String? = null
) {
    companion object {
        private val allowed = setOf(
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

        fun parse(command: JSONObject): NetoAction? {
            if (command.optString("type") != "android_action") {
                return null
            }

            val action = command.optString("action").trim()

            if (action !in allowed) {
                return null
            }

            fun optional(key: String, maxLength: Int): String? {
                val value = command.optString(key, "").trim()

                if (value.isEmpty() || value.length > maxLength) {
                    return null
                }

                return value
            }

            val direction = optional("direction", 10)?.lowercase()

            if (action == "scroll" || action == "swipe") {
                if (direction !in setOf("up", "down", "left", "right")) {
                    return null
                }
            }

            return NetoAction(
                action = action,
                target = optional("target", 256),
                text = optional("text", 8000),
                url = optional("url", 4096),
                direction = direction,
                requestId = optional("requestId", 128)
            )
        }
    }
}
