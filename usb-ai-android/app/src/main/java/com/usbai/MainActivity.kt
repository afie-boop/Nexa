package com.usbai

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private var modelFd: ParcelFileDescriptor? = null
    private var modelName: String? = null
    @Volatile private var modelLoaded = false
    private lateinit var status: TextView
    private lateinit var chat: TextView
    private lateinit var input: EditText
    private lateinit var sendButton: Button
    private lateinit var loadButton: Button
    private lateinit var unloadButton: Button

    companion object {
        private const val PICK_MODEL = 4102
        init { System.loadLibrary("usbai") }
    }
    private external fun nativeLoadModel(fd: Int, contextSize: Int): String
    private external fun nativeGenerate(prompt: String, maxTokens: Int): String
    private external fun nativeUnloadModel()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
        buildUi()
        setStatus("Sambungkan USB OTG, kemudian pilih fail GGUF.")
    }

    private fun buildUi() {
        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(18, 22, 18, 14)
            setBackgroundColor(Color.rgb(12, 12, 12))
        }
        page.addView(TextView(this).apply {
            text = "USB AI"; textSize = 28f; setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
        })
        page.addView(TextView(this).apply {
            text = "Offline • GGUF • Model kekal di USB"; textSize = 13f
            setTextColor(Color.LTGRAY); setPadding(0, 4, 0, 12)
        })
        status = TextView(this).apply {
            textSize = 13f; setTextColor(Color.rgb(180, 220, 180)); setPadding(0, 4, 0, 12)
        }
        page.addView(status)
        loadButton = Button(this).apply {
            text = "Pilih model GGUF dari USB"; setOnClickListener { chooseModel() }
        }
        page.addView(loadButton)
        unloadButton = Button(this).apply {
            text = "Hentikan model sebelum cabut USB"; isEnabled = false
            setOnClickListener { stopModel() }
        }
        page.addView(unloadButton)
        page.addView(TextView(this).apply {
            text = "— Perbualan —"; gravity = Gravity.CENTER; setTextColor(Color.GRAY)
            setPadding(0, 10, 0, 10)
        })
        val scroll = ScrollView(this)
        chat = TextView(this).apply {
            text = "Pilih model daripada pendrive untuk bermula.\n"; textSize = 16f
            setTextColor(Color.WHITE); setPadding(2, 4, 2, 12)
        }
        scroll.addView(chat)
        page.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        input = EditText(this).apply {
            hint = "Taip mesej dalam Bahasa Melayu…"; setHintTextColor(Color.GRAY)
            setTextColor(Color.WHITE); setBackgroundColor(Color.rgb(34, 34, 34))
            minLines = 2; maxLines = 4; setPadding(12, 8, 12, 8)
        }
        page.addView(input)
        sendButton = Button(this).apply {
            text = "Hantar"; isEnabled = false; setOnClickListener { sendMessage() }
        }
        page.addView(sendButton)
        setContentView(page)
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
        if (!name.lowercase().endsWith(".gguf")) { setStatus("Pilih fail .gguf sahaja."); return }
        stopModel(showStatus = false)
        loadButton.isEnabled = false
        setStatus("Membuka $name. UI tidak menyalin fail model.")
        executor.execute {
            var opened: ParcelFileDescriptor? = null
            try {
                opened = contentResolver.openFileDescriptor(uri, "r")
                    ?: throw IllegalStateException("Android tidak dapat membuka fail ini.")
                val result = nativeLoadModel(opened.fd, 2048)
                runOnUiThread {
                    if (result.startsWith("OK:")) {
                        modelFd = opened; modelName = name; modelLoaded = true
                        unloadButton.isEnabled = true; sendButton.isEnabled = true
                        setStatus("Model aktif: $name\n" + result.removePrefix("OK:"))
                        appendChat("Sistem", "Model sedia. Cuba berbual dalam Bahasa Melayu.")
                    } else {
                        try { opened?.close() } catch (_: Throwable) {}
                        setStatus(result)
                    }
                    loadButton.isEnabled = true
                }
            } catch (t: Throwable) {
                try { opened?.close() } catch (_: Throwable) {}
                runOnUiThread {
                    loadButton.isEnabled = true
                    setStatus("Gagal memuatkan model: " + (t.message ?: t.javaClass.simpleName) +
                        "\nUSB mesti tersambung dan model perlu disokong.")
                }
            }
        }
    }

    private fun sendMessage() {
        val prompt = input.text.toString().trim()
        if (prompt.isEmpty() || !modelLoaded) return
        input.setText(""); appendChat("Kau", prompt); sendButton.isEnabled = false
        executor.execute {
            try {
                val answer = nativeGenerate(prompt, 384)
                runOnUiThread { appendChat(modelName ?: "AI", answer); sendButton.isEnabled = modelLoaded }
            } catch (t: Throwable) {
                runOnUiThread { appendChat("Ralat", t.message ?: "Penjanaan gagal."); sendButton.isEnabled = modelLoaded }
            }
        }
    }

    private fun stopModel(showStatus: Boolean = true) {
        modelLoaded = false
        if (::sendButton.isInitialized) sendButton.isEnabled = false
        try { nativeUnloadModel() } catch (_: Throwable) {}
        try { modelFd?.close() } catch (_: Throwable) {}
        modelFd = null; modelName = null
        if (::unloadButton.isInitialized) unloadButton.isEnabled = false
        if (showStatus && ::status.isInitialized) setStatus("Model dihentikan. Sekarang selamat untuk cuba mencabut USB.")
    }
    private fun queryDisplayName(uri: Uri): String? {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) return cursor.getString(0)
        }
        return uri.lastPathSegment
    }
    private fun appendChat(who: String, message: String) { chat.append("\n$who:\n$message\n") }
    private fun setStatus(message: String) { status.text = message }
    override fun onDestroy() {
        stopModel(showStatus = false); executor.shutdownNow(); super.onDestroy()
    }
}
