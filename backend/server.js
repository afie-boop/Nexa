require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

console.log("=================================");
console.log("Nexa Boot");
console.log("=================================");
console.log("OpenRouter Key :", !!process.env.OPENROUTER_KEY);
console.log("Groq Key       :", !!process.env.GROQ_KEY);
console.log("PORT           :", process.env.PORT || 3000);
console.log("=================================");

const classifyTask = require("./router");
const { runPipeline } = require("./pipeline/pipeline");
const askGroq = require("./groq");

const app = express();

app.use(cors());
app.use(express.json());

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

app.post("/chat", async (req, res) => {
  const { question, history } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (res.flushHeaders) {
    res.flushHeaders();
  }

  function sendStatus(text) {
    res.write(
      `data: ${JSON.stringify({
        type: "status",
        text
      })}\n\n`
    );
  }

  function sendAnswer(text) {
    res.write(
      `data: ${JSON.stringify({
        type: "answer",
        text
      })}\n\n`
    );
    res.end();
  }

  function sendError(text) {
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        text
      })}\n\n`
    );
    res.end();
  }

  try {
    if (!question || !question.trim()) {
      return sendError("Mesej tak boleh kosong.");
    }

    sendStatus("Mengelaskan permintaan...");

    const task = await classifyTask(
      question,
      history || []
    );

    const answer = await runPipeline({
      task,
      question,
      history: history || [],
      evoStrategies: req.body.evoStrategies || [],
      sendStatus
    });

    sendAnswer(answer);

  } catch (error) {

    console.log("\n============= ERROR =============");
    console.error(error);
    console.error(error.stack);

    if (error.response) {
      console.log("HTTP Status :", error.response.status);
      console.log("Response :", error.response.data);
    }

    console.log("=================================\n");

    sendError(
      error.message || "Ada masalah pada server."
    );
  }
});

const { getSystemStatus } = require("./evolution/engine");

app.get("/evolution/status", (req, res) => {
  try {
    const status = getSystemStatus();
    res.json(status);
  } catch (error) {
    console.error("Gagal mendapatkan status evolusi:", error);
    res.status(500).json({ error: error.message || "Gagal mendapatkan status evolusi." });
  }
});

app.post("/evolve", async (req, res) => {
  const { history, evoStrategies } = req.body;

  try {
    if (!history || history.length === 0) {
      return res.status(400).json({ error: "Sejarah perbualan diperlukan untuk evolusi." });
    }

    // Call Groq to analyze the conversation
    const prompt = `
Anda adalah Nexa Evolution Core, sistem kognitif AI yang berevolusi sendiri.
Tugasan anda adalah menganalisis perbualan terbaru antara pengguna dan pembantu AI (Nexa), mengenal pasti sebarang kelemahan atau maklum balas negatif, membandingkannya dengan strategi sedia ada, dan menjana satu patch cara berfikir yang baharu.

Senarai Strategi Sedia Ada:
${(evoStrategies || []).map((s, i) => `${i + 1}. ${s}`).join("\n")}

Sejarah Perbualan (beberapa mesej terakhir):
${history.map(h => `${h.role === 'user' ? 'User' : 'Nexa'}: ${h.content}`).join("\n")}

Analisis perkara di atas mengikut langkah berikut:
1. Kenalpasti sebarang kritikan pengguna, teguran ("salah", "tidak berfungsi", "kurang tepat", dll) atau kesilapan respons Nexa (misalnya memberikan kod yang kurang lengkap, kurang semakan, terlalu panjang lebar, dsb).
2. Jika tiada sebarang kritikan jelas daripada pengguna, kenalpasti satu penambahbaikan kognitif atau gaya pembantu yang lebih matang berasaskan perbualan tersebut.
3. Rangka "Kesalahan" (Mistake) yang dikesan (maksimum 2 ayat ringkas, gunakan bahasa Melayu kasual/standard yang mesra).
4. Rangka "Perubahan" (Patch) - iaitu cara berfikir/tindakan baru untuk mengatasi kesalahan tersebut (maksimum 2 ayat ringkas).
5. Rangka satu ayat perintah "Strategi Baru" yang ringkas dan padat untuk dimasukkan ke dalam peraturan kognitif Nexa (contoh: "Mengehadkan saiz kod dan menambah ulasan baris", "Menyemak keserasian versi npm sebelum mencadangkan pakej"). Pastikan strategi ini tidak bertindih dengan strategi sedia ada.

Balas dalam format JSON yang sah seperti di bawah sahaja. Pastikan tiada ulasan atau teks tambahan sebelum atau selepas JSON:
{
  "mistake": "Huraian kesalahan di sini",
  "patch": "Huraian patch/tindakan di sini",
  "newStrategy": "Arahan strategi baru yang ringkas"
}
`;

    const rawResponse = await askGroq(prompt, {
      model: "llama-3.1-8b-instant",
      system: "Anda adalah sistem analisis JSON. Balas hanya dengan objek JSON yang sah mengikut format yang diminta."
    });

    let result;
    try {
      const jsonStart = rawResponse.indexOf("{");
      const jsonEnd = rawResponse.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        result = JSON.parse(rawResponse.substring(jsonStart, jsonEnd + 1));
      } else {
        result = JSON.parse(rawResponse);
      }
    } catch (parseErr) {
      console.error("Gagal parse respon JSON evolusi, menggunakan fallback kognitif.", rawResponse);
      result = {
        mistake: "Gaya penerangan kurang terfokus kepada keperluan teras pengguna.",
        patch: "Mengoptimumkan ketepatan maklumat dan memperkemas struktur jawapan.",
        newStrategy: "Menyusun isi jawapan dengan penomboran berperingkat untuk kejelasan kognitif"
      };
    }

    res.json(result);

  } catch (error) {
    console.error("Ralat dalam evolusi:", error);
    res.status(500).json({ error: error.message || "Gagal menjalankan evolusi kognitif." });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Nexa Server berjalan di port ${port}`);
});
