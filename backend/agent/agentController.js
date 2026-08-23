const askOpenRouter = require("../openrouter");
const { TOOL_DEFINITIONS, executeTool, checkPermissionRequirement, generateDiff } = require("./tools");

// Active pending permission promises map: sessionId -> { requestId, resolve }
const pendingPermissions = new Map();

function resolvePendingPermission(sessionId, requestId, approved) {
  const pending = pendingPermissions.get(sessionId);
  if (pending && pending.requestId === requestId) {
    pending.resolve(approved);
    pendingPermissions.delete(sessionId);
    return true;
  }
  return false;
}

const SYSTEM_PROMPT = `
Anda adalah Nexa Agent (Jules Mode) - ejen pembangunan perisian berasaskan kecerdasan buatan.

Tugas anda adalah menyelesaikan tugasan pengkodan secara autonomi dalam ruang kerja (workspace) projek.

ALAT TERSEDIA:
Anda mempunyai akses kepada alat-alat berikut:
1. list_files(path)
2. read_file(path)
3. search_code(query, path)
4. create_file(path, content)
5. edit_file(path, content)
6. delete_file(path)
7. run_command(command)
8. git_status()
9. git_diff()

CARA MEMANGGUL ALAT (TOOL CALL):
Bila anda ingin menggunakan alat, anda MESTI membalas dengan format blok JSON seperti berikut:

\`\`\`json
{
  "tool": "nama_alat",
  "args": {
    "param1": "nilai1"
  }
}
\`\`\`

CONTOH MEMANGGUL ALAT:
\`\`\`json
{
  "tool": "read_file",
  "args": {
    "path": "src/App.jsx"
  }
}
\`\`\`

ATURAN DAN FORMAT PERANCANGAN (AGENT PLANNING):
Sebelum anda membuat sebarang perubahan fail yang ketara, sila nyatakan perancangan ringkas dalam tindak balas pertama anda dalam format JSON atau teks ringkas:
- Fail yang mungkin diubah
- Perubahan yang dirancang
- Langkah pengesahan (validation steps)

PERATURAN PENTING:
- Panggil SATU alat sahaja dalam setiap balasan.
- Jangan tayang private chain of thought. Sertakan penjelasan mesra untuk pengguna.
- Setelah selesai semua tugasan dan ujian pengesahan, berikan ringkasan akhir (Final Summary) yang jelas dan padat.
`;

function extractToolCall(text) {
  if (!text) return null;

  // 1. Try markdown ```json block extraction
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed.tool) {
        return { tool: parsed.tool, args: parsed.args || {} };
      }
    } catch {
      // Ignore
    }
  }

  // 2. Try parsing whole string or balanced brace JSON substring
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.tool) {
        return { tool: parsed.tool, args: parsed.args || {} };
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

function parsePlanFromText(text) {
  if (!text) return null;
  if (text.toLowerCase().includes("fail") || text.toLowerCase().includes("perancangan") || text.toLowerCase().includes("plan")) {
    return text.split("\n\n")[0];
  }
  return null;
}

async function runAgentTask({
  sessionId,
  question,
  history = [],
  model = "openrouter/free",
  sendEvent
}) {
  const messages = [];

  // Filter history to ensure system prompts aren't duplicated
  const cleanHistory = (history || []).filter(m => m.role !== "system");
  if (cleanHistory.length > 0) {
    messages.push(...cleanHistory);
  }

  // Current user task
  messages.push({
    role: "user",
    content: `Tugasan Pengkodan: ${question}`
  });

  const changedFiles = new Set();
  let fixAttempts = 0;
  const MAX_FIX_ATTEMPTS = 5;
  const MAX_LOOP_STEPS = 25;
  let currentStep = 0;
  let finalSummary = "";
  let isCompleted = false;

  sendEvent("agent_start", { sessionId, question });
  sendEvent("operation", { text: "Meneliti tugasan dan menganalisis projek..." });

  while (currentStep < MAX_LOOP_STEPS && !isCompleted) {
    currentStep++;

    let llmResponseText = "";
    try {
      const historyToPass = messages.slice(0, -1);

      llmResponseText = await askOpenRouter(
        messages[messages.length - 1].content,
        {
          model: model || "openrouter/free",
          system: SYSTEM_PROMPT,
          history: historyToPass
        }
      );
    } catch (err) {
      sendEvent("error", { text: `API Model Error: ${err.message}` });
      throw err;
    }

    if (!llmResponseText) {
      sendEvent("error", { text: "Model tidak mengembalikan balasan." });
      break;
    }

    // Check if response contains a tool call
    const toolCall = extractToolCall(llmResponseText);

    if (!toolCall) {
      // No tool call -> Model finished task or produced final text answer
      finalSummary = llmResponseText;
      isCompleted = true;

      sendEvent("final_answer", {
        summary: finalSummary,
        changedFiles: Array.from(changedFiles),
        success: true
      });
      break;
    }

    // Tool call detected
    const { tool, args } = toolCall;
    const filePath = args.path || args.filePath;

    // Send plan update if detected
    const planText = parsePlanFromText(llmResponseText);
    if (planText) {
      sendEvent("plan", { text: planText });
    }

    // Check permission
    const perm = checkPermissionRequirement(tool, args);

    if (perm.requiresApproval) {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      let diffPreview = "";

      if (["create_file", "edit_file"].includes(tool) && filePath) {
        diffPreview = generateDiff(filePath, args.content || "");
      }

      sendEvent("permission_request", {
        requestId,
        tool,
        args,
        reason: perm.reason,
        diff: diffPreview
      });

      sendEvent("operation", { text: `Menunggu kelulusan pengguna untuk '${tool}'...` });

      // Wait for user approval via promise
      const approved = await new Promise((resolve) => {
        pendingPermissions.set(sessionId, { requestId, resolve });
      });

      if (!approved) {
        sendEvent("tool_result", {
          tool,
          result: "Dinafikan oleh pengguna (Permission denied by user)."
        });

        messages.push({ role: "assistant", content: llmResponseText });
        messages.push({
          role: "user",
          content: `Hasil Alat [${tool}]: Dinafikan oleh pengguna. Sila pilih pendekatan lain atau tamatkan tugasan.`
        });
        continue;
      }
    }

    // Execute approved/auto-allowed tool
    sendEvent("tool_executing", { tool, args });
    sendEvent("operation", { text: `Menjalankan alat: ${tool} ${filePath ? `(${filePath})` : ""}` });

    let toolResultText = "";
    let toolExecutionSuccess = true;

    try {
      const rawResult = await executeTool(tool, args);

      if (["create_file", "edit_file", "delete_file"].includes(tool) && filePath) {
        changedFiles.add(filePath);
        sendEvent("changed_files", { files: Array.from(changedFiles) });
      }

      if (typeof rawResult === "object") {
        toolResultText = JSON.stringify(rawResult, null, 2);
        if (tool === "run_command") {
          toolExecutionSuccess = rawResult.success;
        }
      } else {
        toolResultText = String(rawResult);
      }
    } catch (err) {
      toolExecutionSuccess = false;
      toolResultText = `Error: ${err.message}`;
    }

    sendEvent("tool_result", {
      tool,
      args,
      result: toolResultText,
      success: toolExecutionSuccess
    });

    // Handle Autonomous Fix Loop for validation commands (npm run build, npm test, etc.)
    if (tool === "run_command" && (args.command.includes("build") || args.command.includes("test"))) {
      if (!toolExecutionSuccess) {
        fixAttempts++;
        sendEvent("validation_status", {
          command: args.command,
          success: false,
          attempt: fixAttempts,
          maxAttempts: MAX_FIX_ATTEMPTS,
          error: toolResultText
        });

        if (fixAttempts >= MAX_FIX_ATTEMPTS) {
          isCompleted = true;
          finalSummary = `Tugasan tidak dapat diselesaikan sepenuhnya.\n\nPerubahan dibuat:\n${Array.from(changedFiles).map(f => `- ${f}`).join("\n")}\n\nRalat berbaki:\n${toolResultText}\n\nEjen terhenti selepas ${MAX_FIX_ATTEMPTS} percubaan pembaikan automatik.`;

          sendEvent("final_answer", {
            summary: finalSummary,
            changedFiles: Array.from(changedFiles),
            success: false,
            fixLimitReached: true
          });
          break;
        }
      } else {
        sendEvent("validation_status", {
          command: args.command,
          success: true,
          attempt: fixAttempts,
          maxAttempts: MAX_FIX_ATTEMPTS
        });
      }
    }

    // Feed result back into conversation history for next agent turn
    messages.push({ role: "assistant", content: llmResponseText });
    messages.push({
      role: "user",
      content: `Hasil Alat [${tool}]:\n${toolResultText}\n\nSila teruskan tugasan atau berikan jawapan akhir jika dah selesai.`
    });
  }

  if (currentStep >= MAX_LOOP_STEPS && !isCompleted) {
    sendEvent("final_answer", {
      summary: `Tugasan tamat selepas mencapai had maksimum ${MAX_LOOP_STEPS} langkah.`,
      changedFiles: Array.from(changedFiles),
      success: false
    });
  }
}

module.exports = {
  runAgentTask,
  resolvePendingPermission
};
