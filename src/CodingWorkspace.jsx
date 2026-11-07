import { useEffect, useMemo, useState } from "react";

const DEFAULT_FILES = [
  { path: "src/App.jsx", content: "// Mula bina projek anda di sini\\n" },
  { path: "src/style.css", content: "/* Gaya projek */\\n" },
  { path: "index.html", content: "<!doctype html>\\n<html lang=\\"en\\">\\n<head><meta charset=\\"UTF-8\\"><meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1.0\\"><title>My Project</title></head>\\n<body><div id=\\"root\\"></div></body>\\n</html>\\n" }
];

function safeProjectPath(value) {
  const path = String(value || "").trim().replace(/^\\/+/, "");
  if (!path || path.split("/").some(part => !part || part === "." || part === "..")) return "";
  return /^[a-zA-Z0-9_./-]+$/.test(path) ? path : "";
}

export default function CodingWorkspace({ generalModel, codingModel, fallbackModel, responseMode, aiAvailability }) {
  const [files, setFiles] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("axmchat_workspace_files") || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (_) {}
    return DEFAULT_FILES;
  });
  const [activeFile, setActiveFile] = useState("src/App.jsx");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [showFiles, setShowFiles] = useState(true);
  const currentFile = useMemo(() => files.find(file => file.path === activeFile), [files, activeFile]);

  useEffect(() => {
    try {
      localStorage.setItem("axmchat_workspace_files", JSON.stringify(files));
    } catch (_) {
      setStatus("Storan browser penuh. Muat turun fail sebagai salinan.");
    }
  }, [files]);

  function updateFile(path, content) {
    setFiles(previous => previous.map(file => file.path === path ? { ...file, content } : file));
  }

  function createFile() {
    const path = safeProjectPath(window.prompt("Nama/laluan fail baharu (contoh: src/game.jsx atau assets/game.css):"));
    if (!path) return window.alert("Nama fail tidak sah.");
    if (files.some(file => file.path === path)) return window.alert("Fail itu sudah wujud.");
    setFiles(previous => [...previous, { path, content: "" }]);
    setActiveFile(path);
  }

  function downloadFile(file) {
    if (!file) return;
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.path.split("/").pop() || "code.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function generateProject() {
    const task = prompt.trim();
    if (!task || busy) return;
    setBusy(true);
    setStatus("Coding AI sedang menyediakan projek...");
    try {
      const question = [
        "Anda sedang bekerja dalam AXMchat Coding Workspace.",
        "Permintaan pengguna: " + task,
        "Fail sedia ada: " + files.map(file => file.path).join(", "),
        "Hasilkan projek lengkap dan berfungsi. Pecahkan kepada fail berasingan seperti index.html, src/App.jsx, src/style.css, package.json dan fail lain yang diperlukan.",
        "FORMAT WAJIB bagi setiap fail: satu baris FILE: laluan/fail.ext diikuti satu code fence dengan bahasa yang sesuai dan kandungan fail penuh.",
        "Jangan gabungkan fail. Jangan potong kod. Jangan letak penerangan di dalam code fence. Keluarkan semula fail lengkap yang perlu dicipta atau diganti."
      ].join("\\n\\n");
      const response = await fetch("/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: [],
          generalModel: String(generalModel || "").trim(),
          codingModel: String(codingModel || "").trim(),
          fallbackModel: String(fallbackModel || "").trim(),
          responseMode: responseMode || "balance",
          memoryEnabled: false,
          aiAvailability: aiAvailability || { general: true, coding: true, fallback: true },
          clientTime: { iso: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }
        })
      });
      if (!response.ok || !response.body) throw new Error("Server balas status " + response.status);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let serverError = "";
      const consume = part => {
        if (!part.startsWith("data: ")) return;
        try {
          const data = JSON.parse(part.slice(6));
          if (data.type === "status" && data.text) setStatus(data.text);
          if (data.type === "process_step" && data.label) setStatus(data.label);
          if (data.type === "answer") answer = data.text || "";
          if (data.type === "error") serverError = data.text || "AI gagal menjana kod.";
        } catch (_) {}
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\\n\\n");
        buffer = parts.pop() || "";
        parts.forEach(consume);
      }
      buffer += decoder.decode();
      buffer.split("\\n\\n").forEach(consume);
      if (serverError) throw new Error(serverError);
      if (!answer) throw new Error("Tiada jawapan diterima daripada AI.");

      const generated = [];
      const pattern = /^\\s*(?:#{1,6}\\s*)?(?:\\/\\/\\s*)?FILE:\\s*(.+?)\\s*\\n```([^\\n]*)\\n([\\s\\S]*?)\\n```/gm;
      let match;
      while ((match = pattern.exec(answer)) !== null) {
        const path = safeProjectPath(match[1]);
        if (path) generated.push({ path, content: match[3].replace(/\\n$/, "") + "\\n" });
      }
      if (!generated.length) {
        const single = answer.match(/```(?:jsx?|tsx?|css|html|json|javascript|typescript)?\\s*\\n([\\s\\S]*?)\\n```/i);
        if (single) generated.push({ path: "src/App.jsx", content: single[1] + "\\n" });
      }
      if (!generated.length) throw new Error("Format fail AI tidak dikenali. Cuba jana semula.");
      setFiles(previous => {
        const next = [...previous];
        generated.forEach(item => {
          const index = next.findIndex(file => file.path === item.path);
          if (index >= 0) next[index] = item;
          else next.push(item);
        });
        return next;
      });
      setActiveFile(generated[0].path);
      setPrompt("");
      setStatus(generated.length + " fail berjaya dijana dan disimpan.");
    } catch (error) {
      setStatus(error.message || "Gagal menjana projek.");
    } finally {
      setBusy(false);
    }
  }

  function removeFile() {
    if (!currentFile || !window.confirm("Padam fail " + activeFile + "?")) return;
    const next = files.filter(file => file.path !== activeFile);
    setFiles(next);
    setActiveFile(next[0]?.path || "");
  }

  return (
    <div className="coding-workspace">
      <div className="coding-workspace-heading">
        <div>
          <h2 className="panel-title">Coding Workspace</h2>
          <p className="panel-subtitle">Bina projek dengan AI, edit fail dan simpan kerja anda di sini.</p>
        </div>
        <div className="coding-workspace-toolbar">
          <button type="button" className="card-action-btn" onClick={createFile}>+ New File</button>
          <button type="button" className="card-action-btn" onClick={() => downloadFile(currentFile)} disabled={!currentFile}>Download</button>
        </div>
      </div>

      <div className="coding-ai-prompt flat-card">
        <label htmlFor="workspace-ai-prompt">Describe what you want to build</label>
        <textarea id="workspace-ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Contoh: Buat game platformer 2D dengan React, JSX dan CSS..." rows={3} disabled={busy} />
        <div className="coding-ai-prompt-footer">
          <span>{status || "AI akan pecahkan projek kepada beberapa fail berasingan."}</span>
          <button type="button" className="send-btn" onClick={generateProject} disabled={busy || !prompt.trim()}>{busy ? "Generating..." : "Generate project"}</button>
        </div>
      </div>

      <div className="coding-editor-shell">
        <aside className={`coding-file-sidebar ${showFiles ? "" : "collapsed"}`}>
          <div className="coding-file-sidebar-title"><span>PROJECT FILES</span><button type="button" onClick={() => setShowFiles(value => !value)} aria-label="Toggle file list">⌄</button></div>
          {showFiles && <div className="coding-file-list">
            {files.map(file => <button type="button" key={file.path} className={`coding-file-item ${activeFile === file.path ? "active" : ""}`} onClick={() => setActiveFile(file.path)}>
              <span className="coding-file-dot">{file.path.split(".").pop()?.toUpperCase().slice(0, 3) || "FILE"}</span><span>{file.path}</span>
            </button>)}
          </div>}
        </aside>
        <section className="coding-editor-main">
          <div className="coding-editor-tab">
            <span>{activeFile || "No file selected"}</span>
            <div>
              <button type="button" onClick={removeFile} disabled={!currentFile}>Delete</button>
              <button type="button" onClick={() => downloadFile(currentFile)} disabled={!currentFile}>↓</button>
            </div>
          </div>
          {currentFile ? <textarea className="coding-code-editor" spellCheck="false" autoCapitalize="off" autoCorrect="off" value={currentFile.content} onChange={event => updateFile(activeFile, event.target.value)} /> : <div className="coding-editor-empty">Pilih fail atau cipta fail baharu.</div>}
          <div className="coding-editor-status"><span>● Saved locally</span><span>{currentFile?.content.split("\\n").length || 0} lines</span></div>
        </section>
      </div>
      <p className="coding-workspace-note">Fail disimpan automatik dalam browser pada peranti ini. Gunakan Download untuk simpan salinan ke peranti. Workspace ini belum menjalankan atau membina APK secara langsung.</p>
    </div>
  );
}
