# USB AI (Android prototype)

An offline Android chat prototype for loading a GGUF model from a USB OTG drive without intentionally copying the model into app storage.

## What it does
- Android Storage Access Framework file picker for selecting a .gguf file.
- Passes the opened file descriptor to native llama.cpp through /proc/self/fd/N.
- CPU-first inference with a small context (2048) to reduce RAM pressure.
- Malay Malaysia system instruction for Llama 3.x Instruct models.
- Manual unload control before unplugging USB.

## Important limitations
- This is source code, not a tested release APK. GitHub Actions is configured to attempt an APK build.
- Direct USB loading depends on the Android document provider returning a seekable file descriptor. Some USB providers return a proxy/pipe and won't work with memory-mapped GGUF models. The app deliberately does not fall back to copying the model.
- Tap "Hentikan model / cabut model" before unplugging USB. Hot-unplug safety is not guaranteed.
- Target is arm64-v8a; it has not yet been tested on a physical Samsung S21.
- CPU inference is enabled first. Adreno GPU acceleration is not enabled in this prototype.
- The prompt template is for Llama 3.x Instruct family; other GGUF model families may require a different chat template.
- A 2.4 GB GGUF still needs extra RAM for runtime buffers and context. A Samsung S21 with 8 GB RAM may fail to load it.
- llama.cpp is fetched from upstream during build. Upstream API changes may occasionally require code updates.

## Build
Open this folder in Android Studio with Android SDK 35, NDK, and CMake 3.22.1 installed. Allow Gradle to sync, then build the debug APK. Or use the GitHub Actions workflow and download the APK artifact from a successful run.

## Storage behavior
The app uses ACTION_OPEN_DOCUMENT and keeps a ParcelFileDescriptor; it does not intentionally copy the GGUF into app storage. Small app files/settings remain in internal storage. USB must remain connected while the model is loaded.