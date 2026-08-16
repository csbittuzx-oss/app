# Soundwave 🎵

> High-Fidelity Music Streaming & Offline Backup Player for Android.

[![Download Soundwave APK](https://img.shields.io/badge/Download-Soundwave.apk-FF8C00?style=for-the-badge&logo=android&logoColor=white)](https://github.com/b2raj123zx-wq/soundwaves/raw/main/release/Soundwave.apk)
[![Release Version](https://img.shields.io/badge/Version-v1.2.0-00E5FF?style=for-the-badge)](https://github.com/b2raj123zx-wq/soundwaves/raw/main/release/Soundwave-v1.2.0.apk)

---

## 📥 Download Soundwave

| File | Type | Download Link |
| :--- | :--- | :--- |
| **Soundwave.apk** | Production Release APK *(~1.45 MB)* | [⬇️ **Download Soundwave.apk**](https://github.com/b2raj123zx-wq/soundwaves/raw/main/release/Soundwave.apk) |
| **Soundwave-v1.2.0.apk** | Versioned Release APK | [⬇️ **Download Soundwave-v1.2.0.apk**](https://github.com/b2raj123zx-wq/soundwaves/raw/main/release/Soundwave-v1.2.0.apk) |
| **Soundwave.aab** | Android App Bundle (Google Play) | [⬇️ **Download Soundwave.aab**](https://github.com/b2raj123zx-wq/soundwaves/raw/main/release/Soundwave.aab) |

---

## ✨ Features

- 🎧 **Studio-Grade 320 kbps Streaming**: Pristine audio quality with lossless dynamics.
- 📱 **Continuous Background Audio**: Native `MediaPlaybackService` foreground service with full lock-screen media controls.
- ⚡ **Ultra-Lightweight**: R8 optimized and shrunk down to just **~1.45 MB**.
- 📶 **Spotify-Style Offline Backup**: Automatically caches your favorite tunes for offline listening without internet.
- 🎨 **Aura Design Language**: Modern dark interface with dynamic backdrop glow and smooth animations.
- 🔄 **In-App Update Engine**: Automatic update checking & notifications powered by Soundwave Cloud.

---

## 🛠️ Build from Source

```bash
# Install dependencies
npm install

# Build web distribution & sync capacitor
npm run build
npx cap sync android

# Build release APK & AAB
build_release.bat
```
