package com.neto.assistant

import org.json.JSONArray
import org.json.JSONObject

data class NetoActionResult(
    val ok: Boolean,
    val message: String,
    val action: String? = null,
    val code: String? = null,
    val choices: List<String> = emptyList(),
    val needsConfirmation: Boolean = false,
    val requestId: String? = null
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("ok", ok)
            put("message", message)

            if (!action.isNullOrBlank()) {
                put("action", action)
            }

            if (!code.isNullOrBlank()) {
                put("code", code)
            }

            if (choices.isNotEmpty()) {
                put("choices", JSONArray(choices))
            }

            if (needsConfirmation) {
                put("needsConfirmation", true)
            }

            if (!requestId.isNullOrBlank()) {
                put("requestId", requestId)
            }
        }
    }

    companion object {
        fun success(
            message: String,
            action: String? = null,
            requestId: String? = null
        ) = NetoActionResult(
            ok = true,
            message = message,
            action = action,
            requestId = requestId
        )

        fun failure(
            message: String,
            code: String? = null,
            action: String? = null,
            choices: List<String> = emptyList(),
            requestId: String? = null
        ) = NetoActionResult(
            ok = false,
            message = message,
            action = action,
            code = code,
            choices = choices,
            requestId = requestId
        )

        fun confirmation(
            message: String,
            action: String,
            requestId: String? = null
        ) = NetoActionResult(
            ok = false,
            message = message,
            action = action,
            needsConfirmation = true,
            requestId = requestId
        )
    }
}
