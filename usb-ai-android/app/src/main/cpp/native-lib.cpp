#include <jni.h>
#include <string>
#include <vector>
#include <mutex>
#include <cerrno>
#include <cstring>
#include <unistd.h>
#include <sys/stat.h>
#include <sstream>
#include <android/log.h>
#include "llama.h"

static llama_model *g_model = nullptr;
static llama_context *g_ctx = nullptr;
static llama_sampler *g_sampler = nullptr;
static std::mutex g_mutex;
static std::string g_load_log;

static void captureLlamaLog(enum ggml_log_level level, const char *text, void *) {
    if (!text) return;
    __android_log_write(level >= GGML_LOG_LEVEL_WARN ? ANDROID_LOG_WARN : ANDROID_LOG_INFO,
                        "USB_AI_LLAMA", text);
    g_load_log.append(text);
    if (g_load_log.size() > 5000) g_load_log.erase(0, g_load_log.size() - 5000);
}

static std::string toString(JNIEnv *env, jstring value) {
    if (!value) return {};
    const char *chars = env->GetStringUTFChars(value, nullptr);
    std::string out(chars ? chars : "");
    if (chars) env->ReleaseStringUTFChars(value, chars);
    return out;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_usbai_MainActivity_nativeLoadModel(JNIEnv *env, jobject, jint fd, jint contextSize) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_sampler) { llama_sampler_free(g_sampler); g_sampler = nullptr; }
    if (g_ctx) { llama_free(g_ctx); g_ctx = nullptr; }
    if (g_model) { llama_model_free(g_model); g_model = nullptr; }
    llama_backend_init();
    g_load_log.clear();
    llama_log_set(captureLlamaLog, nullptr);
    if (fd < 0) return env->NewStringUTF("Ralat: deskriptor fail USB tidak sah.");
    struct stat st {};
    if (fstat(fd, &st) != 0) return env->NewStringUTF("Ralat membaca maklumat fail USB.");
    errno = 0;
    const off_t current = lseek(fd, 0, SEEK_CUR);
    if (current == (off_t)-1) {
        return env->NewStringUTF("USB dibuka sebagai aliran tanpa akses rawak (seek). Untuk kekalkan model di USB, Android perlu memberikan fail sebenar yang seekable; app tidak menyalin model ke telefon.");
    }
    char magic[4] = {};
    const ssize_t got = pread(fd, magic, sizeof(magic), 0);
    if (got != 4 || std::string(magic, 4) != "GGUF") {
        return env->NewStringUTF("Fail yang dipilih tidak mempunyai pengepala GGUF yang sah. Pilih fail .gguf sebenar daripada pendrive.");
    }
    const std::string path = "/proc/self/fd/" + std::to_string(fd);
    llama_model_params mp = llama_model_default_params();
    mp.n_gpu_layers = 0;
    g_model = llama_model_load_from_file(path.c_str(), mp);
    if (!g_model) {
        std::string detail = g_load_log;
        while (!detail.empty() && (detail.back() == '\\n' || detail.back() == '\\r')) detail.pop_back();
        const size_t last = detail.find_last_of("\\n");
        if (last != std::string::npos) detail = detail.substr(last + 1);
        if (detail.empty()) detail = "Enjin tidak memberikan butiran tambahan.";
        const std::string message = "GGUF gagal dibuka tanpa menyalin model. Log enjin: " + detail;
        return env->NewStringUTF(message.c_str());
    }
    llama_context_params cp = llama_context_default_params();
    cp.n_ctx = static_cast<uint32_t>(contextSize);
    cp.n_batch = 128; cp.n_threads = 4; cp.n_threads_batch = 4;
    g_ctx = llama_init_from_model(g_model, cp);
    if (!g_ctx) {
        llama_model_free(g_model); g_model = nullptr;
        return env->NewStringUTF("Model dibaca tetapi RAM tidak mencukupi untuk konteks.");
    }
    g_sampler = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(g_sampler, llama_sampler_init_temp(0.7f));
    llama_sampler_chain_add(g_sampler, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
    return env->NewStringUTF("OK:CPU • konteks 2048 • UI tidak membuat salinan model.");
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_usbai_MainActivity_nativeGenerate(JNIEnv *env, jobject, jstring promptText, jint maxTokens) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (!g_model || !g_ctx || !g_sampler) return env->NewStringUTF("Muatkan model dahulu.");
    const std::string user = toString(env, promptText);
    const std::string prompt =
        "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
        "Anda ialah pembantu AI yang menjawab secara semula jadi dalam Bahasa Melayu Malaysia. "
        "Jawab dengan jelas, tepat dan jujur.<|eot_id|>"
        "<|start_header_id|>user<|end_header_id|>\n" + user +
        "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n";
    const llama_vocab *vocab = llama_model_get_vocab(g_model);
    int32_t needed = -llama_tokenize(vocab, prompt.c_str(), (int32_t)prompt.size(), nullptr, 0, true, true);
    if (needed <= 0) return env->NewStringUTF("Gagal menokenkan prompt.");
    std::vector<llama_token> tokens((size_t)needed);
    int32_t count = llama_tokenize(vocab, prompt.c_str(), (int32_t)prompt.size(), tokens.data(), (int32_t)tokens.size(), true, true);
    if (count < 0) return env->NewStringUTF("Gagal menokenkan prompt.");
    tokens.resize((size_t)count);
    llama_memory_clear(llama_get_memory(g_ctx), true);
    llama_sampler_reset(g_sampler);
    llama_batch batch = llama_batch_get_one(tokens.data(), (int32_t)tokens.size());
    if (llama_decode(g_ctx, batch) != 0) return env->NewStringUTF("Gagal memproses prompt; cuba mesej lebih pendek.");
    std::string output;
    std::vector<char> piece(4096);
    for (int i = 0; i < maxTokens; ++i) {
        llama_token token = llama_sampler_sample(g_sampler, g_ctx, -1);
        llama_sampler_accept(g_sampler, token);
        if (llama_vocab_is_eog(vocab, token)) break;
        int n = llama_token_to_piece(vocab, token, piece.data(), (int32_t)piece.size(), 0, true);
        if (n > 0) output.append(piece.data(), (size_t)n);
        llama_token one = token;
        llama_batch next = llama_batch_get_one(&one, 1);
        if (llama_decode(g_ctx, next) != 0) break;
    }
    if (output.empty()) output = "(Tiada teks dihasilkan. Cuba prompt lebih pendek.)";
    return env->NewStringUTF(output.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_usbai_MainActivity_nativeUnloadModel(JNIEnv *, jobject) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_sampler) { llama_sampler_free(g_sampler); g_sampler = nullptr; }
    if (g_ctx) { llama_free(g_ctx); g_ctx = nullptr; }
    if (g_model) { llama_model_free(g_model); g_model = nullptr; }
}
