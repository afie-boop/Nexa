# AXMchat Android

This is a lightweight Android WebView wrapper for the deployed AXMchat app.

- Package: `com.axmchat.app`
- App name: `AXMchat`
- Minimum Android: 6.0 (API 23)
- Build JDK: 17
- Web app: https://nexa-y10p.onrender.com

## Build a debug APK

From this directory:

```bash
gradle assembleDebug
```

APK output:

```
app/build/outputs/apk/debug/app-debug.apk
```

The app requires an internet connection. Chat and memory continue to use the existing Render and Supabase backend; this Android wrapper does not change either service.
