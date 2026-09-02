# NETO Android host

This is a native Android wrapper for the existing NETO PWA, not a replacement app.

## Build

Open `android/` in Android Studio with JDK 17 and Android SDK 35 installed, then run `:app:assembleDebug`. Set `NETO_ORIGIN` in `app/build.gradle.kts` to the deployed HTTPS NETO origin before release.

## Security model

- `window.NetoNative` has only `execute(json)` and `getCapabilityStatus()`.
- The bridge accepts only `type: "android_action"` commands from the configured NETO origin.
- `NetoAndroidController` has a fixed action allowlist; it does not accept shell commands, JavaScript, arbitrary class/method calls, root commands, or arbitrary intent URIs.
- Calls use `ACTION_DIAL`; SMS uses `ACTION_SENDTO`. Android shows the final confirmation UI.
- Contact lookup requests `READ_CONTACTS` only when the user asks for a contact action.
- Screen reading and UI control exist only while the user has explicitly enabled NETO's accessibility service. The app does not capture or monitor the screen in the background.
- Screen capture and direct/silent SMS are intentionally not exposed. MediaProjection must be built with an explicit user-consent flow before it is enabled.

## Implemented controller actions

`open_app`, `open_file`, `open_url`, `open_settings`, `make_call`, `compose_sms`, `read_screen`, `type_text`, `tap`, `long_press`, `scroll`, `swipe`, `go_back`, `go_home`, `copy_text`, and `paste_text`.

`tap` and `long_press` resolve accessibility node text rather than raw coordinates. `scroll` and `swipe` use the active scrollable accessibility node. Exact outcome confirmation for external applications still needs real-device validation.
