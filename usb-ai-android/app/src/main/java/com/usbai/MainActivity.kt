package com.usbai

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private var modelFd: ParcelFileDescriptor? = null
    private var modelName: String? = null
    @Volatile private var modelLoaded = false
    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader

    companion object {
        private const val PICK_MODEL = 4102
        init { System.loadLibrary("usbai") }
    }

    private external fun nativeLoadModel(fd: Int, contextSize: Int): String
    private external fun nativeGenerate(prompt: String, maxTokens: Int): String
    private external fun nativeUnloadModel()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(9, 13, 22)
        window.navigationBarColor = android.graphics.Color.rgb(9, 13, 22)

        // Serve bundled web files from a secure HTTPS-style origin. Modern Vite
        // builds use ES modules, which can fail to execute from file:/// URLs.
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this, "www"))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ) = assetLoader.shouldInterceptRequest(request.url)
            }
            addJavascriptInterface(UsbAiBridge(), "USB_AI")
        }
        setContentView(webView)
        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    inner class UsbAiBridge {
        @JavascriptInterface fun pickModel() { runOnUiThread { chooseModel() } }
        @JavascriptInterface fun stopModel() { runOnUiThread { stopModelInternal(true) } }
        @JavascriptInterface fun generate(prompt: String, requestId: String) {
            executor.execute {
                var answer = ""
                var error: String? = null
                try {
                    if (!modelLoaded) throw IllegalStateException("Pilih dan muatkan model GGUF dari USB dahulu.")
                    answer = nativeGenerate(prompt, 384)
                } catch (t: Throwable) {
                    error = t.message ?: "Model gagal menjana jawapan."
                }
                runOnUiThread {
                    val id = JSONObject.quote(requestId)
                    val result = JSONObject.quote(answer)
                    val err = if (error == null) "null" else JSONObject.quote(error)
                    webView.evaluateJavascript("window.__usbAiResolve && window.__usbAiResolve($id,$result,$err)", null)
                }
            }
        }
    }

    private fun chooseModel() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/octet-stream", "application/x-gguf"))
        }
        startActivityForResult(intent, PICK_MODEL)
    }

    @Deprecated("Legacy callback retained for broad Android compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_MODEL || resultCode != RESULT_OK) return
        val uri: Uri = data?.data ?: return
        val name = queryDisplayName(uri) ?: "model.gguf"
        if (!name.lowercase().endsWith(".gguf")) {
            setWebStatus(false, "", "Pilih fail .gguf sahaja.")
            return
        }
        stopModelInternal(false)
        setWebStatus(false, name, "Membuka model dari USB…")
        executor.execute {
            var opened: ParcelFileDescriptor? = null
            try {
                opened = contentResolver.openFileDescriptor(uri, "r")
                    ?: throw IllegalStateException("Android tidak dapat membuka fail ini.")
                val result = nativeLoadModel(opened.fd, 2048)
                runOnUiThread {
                    if (result.startsWith("OK:")) {
                        modelFd = opened
                        modelName = name
                        modelLoaded = true
                        setWebStatus(true, name, "Model aktif di USB")
                    } else {
                        try { opened?.close() } catch (_: Throwable) {}
                        setWebStatus(false, name, result)
                    }
                }
            } catch (t: Throwable) {
                try { opened?.close() } catch (_: Throwable) {}
                runOnUiThread {
                    setWebStatus(false, name, "Gagal memuatkan model: " + (t.message ?: t.javaClass.simpleName))
                }
            }
        }
    }

    private fun setWebStatus(loaded: Boolean, name: String, status: String) {
        if (!::webView.isInitialized) return
        val js = "window.__usbAiSetStatus && window.__usbAiSetStatus($loaded,${JSONObject.quote(name)},${JSONObject.quote(status)})"
        webView.evaluateJavascript(js, null)
    }

    private fun stopModelInternal(showStatus: Boolean) {
        modelLoaded = false
        try { nativeUnloadModel() } catch (_: Throwable) {}
        try { modelFd?.close() } catch (_: Throwable) {}
        modelFd = null
        modelName = null
        if (showStatus) setWebStatus(false, "", "Model dihentikan. USB boleh dicabut.")
    }

    private fun queryDisplayName(uri: Uri): String? {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) return cursor.getString(0)
        }
        return uri.lastPathSegment
    }

    override fun onDestroy() {
        stopModelInternal(false)
        executor.shutdownNow()
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }
}
