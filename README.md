# 🤖 NETO

### AI-Powered Personal Assistant • Web • PWA • Android

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Android APK](https://img.shields.io/badge/Android-APK-green.svg)](./NETO.apk)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20PWA%20%7C%20Android-orange.svg)](#-requirements)
[![AI](https://img.shields.io/badge/AI-Normal%20%7C%20Pro-purple.svg)](#-ai-modes)

---

## 📥 Download NETO

### 📱 Android APK

**[⬇️ DOWNLOAD NETO APK](./NETO.apk)**

Tap the link above to download the Android APK directly from this repository.

**APK:** `NETO.apk`  
**Current build:** Debug  
**Size:** ~7.5 MB

> ⚠️ The current APK is a development/debug build intended for testing.

---

## 📜 License

NETO is released under the **MIT License**.

**[📄 View Full License](./LICENSE)**

The license file is included in this repository.

---

## 🧠 What NETO Is

**NETO** is an AI-powered personal assistant designed to bring text, image/file processing, and live voice capabilities together in one application.

NETO provides two user-facing AI modes:

1. **Normal Mode**
2. **Pro Mode**

The underlying AI provider names are intentionally hidden from the NETO interface. Users interact with the simple **Normal** and **Pro** experience.

---

## ✨ Features

### 🤖 AI

- Normal AI mode
- Pro AI mode
- Text conversations
- Image support
- File support
- Multiple AI capabilities through the backend

### 🎙️ Voice

- Live voice interaction
- Gemini Live integration for Normal mode
- OpenAI Realtime integration for Pro mode
- Server-side WebSocket voice proxy

### 📱 Application

- Android APK
- Progressive Web App support
- Responsive interface
- Settings
- History
- About section
- Install section
- Browser back navigation
- Application back navigation

---

## 🧩 AI Modes

### 🟢 Normal

Normal mode provides:

- Text
- Images/files
- Live voice

Normal voice uses the **Gemini Live API**.

### 🔵 Pro

Pro mode provides:

- Text
- Images/files
- Live voice

Pro voice uses the **OpenAI Realtime API** through the server WebSocket proxy.

---

## 📋 Requirements

### For Android

- Android device
- `NETO.apk`
- Internet connection for AI/backend features

### For Development

You need:

- Git
- Node.js
- npm
- A configured NETO backend
- Required API credentials

---

## 🔐 Environment Variables

Configure these variables on the backend/deployment platform:

```text
GEMINI_API_KEY
OPENAI_API_KEY
FIREBASE_SERVICE_ACCOUNT_KEY
