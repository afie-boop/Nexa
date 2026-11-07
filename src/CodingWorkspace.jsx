import { useEffect, useMemo, useState } from "react";

const DEFAULT_FILES = [
  { path: "src/App.jsx", content: "function App() {\\n  return <main className=\\"app\\"><h1>Hello, AXMchat!</h1><p>Mula bina projek anda di sini.</p></main>;\\n}\\n" },
  { path: "src/style.css", content: "body { margin: 0; font-family: system-ui, sans-serif; }\\n.app { min-height: 100vh; display: grid; place-content: center; text-align: center; }\\n" },
  { path: "index.html", content: "<!doctype html>\\n<html lang=\\"en\\">\\n<head><meta charset=\\"UTF-8\\"><meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1.0\\"><title>My Project</title></head>\\n<body><div id=\\"root\\"></div></body>\\n</html>\\n" }
];

function safeProjectPath(value) {
  const path = String(value || "").trim().replace(/^\\/+/, "");
  if (!path || path.split("/").some(part => !part || part === "." || part === "..")) return "";
  return /^[a-zA-Z0-9_./-]+$/.test(path) ? path : "";
}

function makePreviewDocument(files) {
  const find = ext => files.filter(file => file.path.toLowerCase().endsWith(ext));
  const htmlFile = files.find(file => file.path.toLowerCase() === "index.html");
  let html = htmlFile?.content || "<!doctype html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><div id='root'></div></body></html>";
  const css = find(".css").map(file => file.content).join("\\n");
  const js = find(".js").map(file => file.content).join("\\n");
  const jsx = find(".jsx").map(file => file.content).join("\\n");
  const styleTag = "<style>" + css.replace(/<\\/style/gi, "<\\\\/style") + "</style>";
  const scripts = "<script src='https://unpkg.com/react@18/umd/react.development.js'><\\/script>" +
    "<script src='https://unpkg.com/react-dom@18/umd/react-dom.development.js'><\\/script>" +
    (jsx ? "<script src='https://unpkg.com/@babel/standalone/babel.min.js'><\\/script>" : "");
  let runtime = "";
  if (jsx) {
    const safeJsx = JSON.stringify(jsx).replace(/<\\/script/gi, "<\\\\/script");
    runtime = "<script>(function(){try{" +
      "var source=" + safeJsx + ";" +
      "source=source.replace(/^\\\\s*import\\\\s+[^\\\\n]*\\\\n/gm,'').replace(/^\\\\s*export\\\\s+default\\\\s+/gm,'').replace(/^\\\\s*export\\\\s+(?=(function|class|const|let|var)\\\\b)/gm,'');" +
      "var compiled=Babel.transform(source,{presets:['env','react']}).code;" +
      "var runner=new Function('React','ReactDOM',compiled+';if(typeof App!==\\'undefined\\'&&!/createRoot|ReactDOM\\\\.render/.test(" + JSON.stringify(jsx) + ")){ReactDOM.createRoot(document.getElementById(\\'root\\')||document.body).render(React.createElement(App));}');" +
      "runner(React,ReactDOM);" +
      "}catch(error){var box=document.getElementById('__axm_error');if(box){box.style.display='block';box.textContent='JSX preview error: '+error.message;}}})();<\\/script>";
  }
  const jsTag = js ? "<script>" + js.replace(/<\\/script/gi, "<\\\\/script") + "<\\/script>" : "";
  const errorBox = "<pre id='__axm_error' style='display:none;white-space:pre-wrap;margin:12px;padding:12px;background:#fee;color:#900;border-radius:8px;font:12px monospace'></pre>";
  const additions = styleTag + errorBox + scripts + runtime + jsTag;
  if (/<\\/head>/i.test(html)) html = html.replace(/<\\/head>/i, additions + "</head>");
  else html = additions + html;
  return html;
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
  const [showAddFile, setShowAddFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [view, setView] = useState("editor");
  const [previewDoc, setPreviewDoc] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const currentFile = useMemo(() => files.find(file => file.path === activeFile), [files, activeFile]);

  useEffect(() => {
    try { localStorage.setItem("axmchat_workspace_files", JSON.stringify(files)); }
    catch (_) { setStatus("Storan browser penuh. Muat turun projek sebagai salinan."); }
  }, [files]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewDoc(makePreviewDocument(files)), 450);
    return () => window.clearTimeout(timer);
  }, [files]);

  function updateFile(path, content) {
    setFiles(previous => previous.map(file => file.path === path ? { ...file, content } : file));
  }

  function addFile() {
    const path = safeProjectPath(newFileName);
    if (!path) return setStatus("Masukkan nama fail yang sah, contoh: src/game.jsx");
    if (files.some(file => file.path === path)) return setStatus("Fail dengan nama itu sudah wujud.");
    setFiles(previous => [...previous, { path, content: "" }]);
    setActiveFile(path);
    setNewFileName("");
    setShowAddFile(false);
    setView("editor");
    setStatus("Fail " + path + " berjaya ditambah.");
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
        "Anda sedang bekerja dalam AXMchat Coding Workspace yang mempunyai live preview.",
        "Permintaan pengguna: " + task,
        "Fail sedia ada: " + files.map(file => file.path).join(", "),
        "Hasilkan projek lengkap dan boleh dipratonton. Utamakan index.html, src/App.jsx (komponen utama bernama App), src/style.css dan src/main.js jika perlu.",
        "Untuk preview JSX, jangan gunakan import daripada fail tempatan atau pakej npm. Gunakan React global dan komponen utama bernama App; jangan panggil createRoot sendiri. Jangan import CSS. CSS akan digabungkan automatik.",
        "Untuk projek HTML biasa, hasilkan HTML, CSS dan JavaScript biasa yang tidak memerlukan bundler.",
        "FORMAT WAJIB setiap fail: FILE: laluan/fail.ext pada satu baris diikuti code fence dengan kandungan penuh. Satu code fence bagi setiap fail.",
        "Jangan gabungkan fail, jangan potong kod, dan keluarkan semula semua fail yang perlu dicipta atau diganti."
      ].join("\\n\\n");
      const response = await fetch("/chat", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question, history: [],
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
      let buffer = "", answer = "", serverError = "";
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
      const pattern = /^\\s*(?:#{1,6}\\s*)?(?:\\/\\/\\s*)?FILE:\\s*(.+?)\\s*\\n\`\`\`([^\n]*)\\n([\\s\\S]*?)\\n\`\`\`/gm;
      let match;
      while ((match = pattern.exec(answer)) !== null) {
        const path = safeProjectPath(match[1]);
        if (path) generated.push({ path, content: match[3].replace(/\\n$/, "") + "\\n" });
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
      setView("preview");
      setStatus(generated.length + " fail berjaya dijana. Live preview sedang dikemas kini.");
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
      <header className="cw-heading">
        <div className="cw-heading-copy">
          <span className="cw-eyebrow">AXMCHAT DEVELOPER TOOLS</span>
          <h2>Coding Workspace</h2>
          <p>Bina projek bersama AI, urus fail dan lihat hasilnya secara langsung.</p>
        </div>
        <div className="cw-heading-actions">
          <button type="button" className="cw-secondary-btn" onClick={() => setShowAddFile(value => !value)}>＋ Add file</button>
        </div>
      </header>

      <section className="cw-ai-card">
        <div className="cw-ai-label"><span className="cw-ai-spark">✦</span><label htmlFor="workspace-ai-prompt">Apa yang anda mahu bina?</label></div>
        <textarea id="workspace-ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Contoh: Bina game platformer 2D dengan skor, musuh dan butang kawalan..." rows={3} disabled={busy} />
        <div className="cw-ai-footer">
          <span className="cw-status-text">{status || "AI akan hasilkan fail projek secara berasingan."}</span>
          <button type="button" className="cw-generate-btn" onClick={generateProject} disabled={busy || !prompt.trim()}>{busy ? "Sedang membina…" : "✦ Generate project"}</button>
        </div>
      </section>

      {showAddFile && (
        <form className="cw-add-file" onSubmit={event => { event.preventDefault(); addFile(); }}>
          <div className="cw-add-file-copy"><strong>Tambah fail baharu</strong><span>Masukkan nama dan lokasi fail pilihan anda.</span></div>
          <input value={newFileName} onChange={event => setNewFileName(event.target.value)} placeholder="Contoh: src/player.jsx atau styles/game.css" aria-label="Nama dan lokasi fail" autoFocus />
          <button type="submit" disabled={!newFileName.trim()}>Create file</button>
          <button type="button" className="cw-cancel-add" onClick={() => { setShowAddFile(false); setNewFileName(""); }}>Cancel</button>
        </form>
      )}

      <section className="cw-workbench">
        <aside className={\`cw-file-panel \${showFiles ? "" : "cw-file-panel-hidden"}\`}>
          <div className="cw-panel-heading"><span>EXPLORER</span><button type="button" onClick={() => setShowFiles(value => !value)} aria-label="Toggle file explorer">{showFiles ? "‹" : "›"}</button></div>
          {showFiles && <div className="cw-file-list">
            {files.map(file => <button type="button" key={file.path} className={\`cw-file-row \${activeFile === file.path ? "active" : ""}\`} onClick={() => { setActiveFile(file.path); setView("editor"); }}>
              <span className={\`cw-file-type cw-ext-\${file.path.split(".").pop()?.toLowerCase()}\`}>{file.path.split(".").pop()?.toUpperCase().slice(0, 3) || "FILE"}</span><span className="cw-file-path">{file.path}</span>
            </button>)}
            {!files.length && <p className="cw-empty-files">Belum ada fail.</p>}
          </div>}
          {showFiles && <button type="button" className="cw-add-file-side" onClick={() => setShowAddFile(true)}>＋ Add file</button>}
        </aside>

        <div className="cw-main-panel">
          <div className="cw-workbench-toolbar">
            <div className="cw-view-tabs">
              <button type="button" className={view === "editor" ? "active" : ""} onClick={() => setView("editor")}>〈/〉 Editor</button>
              <button type="button" className={view === "preview" ? "active" : ""} onClick={() => { setView("preview"); setPreviewKey(value => value + 1); }}>▣ Preview</button>
            </div>
            <div className="cw-toolbar-right">
              {view === "editor" && <><span className="cw-active-filename">{activeFile || "No file selected"}</span><button type="button" className="cw-tool-btn" onClick={removeFile} disabled={!currentFile}>Delete</button><button type="button" className="cw-tool-btn" onClick={() => downloadFile(currentFile)} disabled={!currentFile}>↓ Download</button></>}
              {view === "preview" && <><span className="cw-live-indicator"><i /> Live</span><button type="button" className="cw-tool-btn" onClick={() => setPreviewKey(value => value + 1)}>↻ Refresh</button></>}
            </div>
          </div>

          {view === "editor" ? (
            <div className="cw-editor-area">
              {currentFile ? <textarea className="cw-code-editor" spellCheck="false" autoCapitalize="off" autoCorrect="off" autoComplete="off" value={currentFile.content} onChange={event => updateFile(activeFile, event.target.value)} aria-label={activeFile} /> : <div className="cw-empty-editor">Pilih fail dalam Explorer atau tambah fail baharu.</div>}
              <div className="cw-editor-footer"><span>● Auto-saved on this device</span><span>{currentFile?.content.split("\\n").length || 0} lines</span></div>
            </div>
          ) : (
            <div className="cw-preview-area">
              <div className="cw-preview-topline"><span>PROJECT PREVIEW</span><span>Perubahan dipaparkan secara automatik</span></div>
              <iframe key={previewKey} title="Project live preview" className="cw-preview-frame" sandbox="allow-scripts" srcDoc={previewDoc || "<!doctype html><html><body style='font-family:sans-serif;padding:24px'>Menyiapkan preview…</body></html>"} />
            </div>
          )}
        </div>
      </section>
      <p className="cw-footnote">Fail disimpan dalam browser peranti ini. Preview berjalan dalam ruang terasing; projek yang memerlukan pakej npm atau import fail kompleks memerlukan proses build berasingan.</p>
    </div>
  );
}
