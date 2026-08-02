import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

function App() {
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState(() => {
    try {
      const saved = localStorage.getItem("nexa_chat_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [memoryEnabled, setMemoryEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem("nexa_memory_enabled");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [load, setLoad] = useState(false);
  const [error, setError] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [statusText, setStatusText] = useState("Nexa sedang berfikir...");
  const chatEndRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem("nexa_chat_history", JSON.stringify(chat));
    } catch (err) {
      console.error("Gagal menyimpan sejarah ke localStorage", err);
    }
  }, [chat]);

  useEffect(() => {
    try {
      localStorage.setItem("nexa_memory_enabled", JSON.stringify(memoryEnabled));
    } catch (err) {
      console.error("Gagal menyimpan tetapan ingatan ke localStorage", err);
    }
  }, [memoryEnabled]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, load]);

  async function send() {
    if (!msg.trim() || load) return;

    const text = msg;
    const historyForRequest = memoryEnabled
      ? chat.map((m) => ({
          role: m.type === "user" ? "user" : "assistant",
          content: m.text,
        }))
      : [];

    setChat((prev) => [...prev, { type: "user", text }]);
    setMsg("");
    setLoad(true);
    setStatusText("Nexa sedang berfikir...");
    setError(null);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: historyForRequest }),
      });

      if (!res.ok || !res.body) throw new Error(`Server balas status ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalAnswer = null;
      let serverError = null;
      const processLog = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const data = JSON.parse(part.slice(6));

          if (data.type === "status") {
            setStatusText(data.text);
            processLog.push(data.text);
          } else if (data.type === "answer") {
            finalAnswer = data.text;
          } else if (data.type === "error") {
            serverError = data.text;
          }
        }
      }

      if (serverError) throw new Error(serverError);
      if (finalAnswer === null) throw new Error("Tiada jawapan diterima.");

      setChat((prev) => [...prev, { type: "ai", text: finalAnswer, process: processLog }]);
    } catch (err) {
      setError(err.message || "Gagal hubungi server. Cuba refresh.");
      setChat((prev) => [
        ...prev,
        { type: "ai", text: `⚠️ Maaf, saya tak dapat balas sekarang: ${err.message || "Gagal hubungi server."}` },
      ]);
      console.error(err);
    } finally {
      setLoad(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function copyCode(content, key) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(key);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  }

  const MarkdownComponents = {
    code({ node, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const isInline = !match;
      const lang = match ? match[1] : "text";
      const content = String(children).replace(/\n$/, "");
      const key = node?.position
        ? `${node.position.start.line}-${node.position.start.column}`
        : content.slice(0, 20) + content.length;

      if (isInline) {
        return (
          <code className="inline-code" {...props}>
            {children}
          </code>
        );
      }

      return (
        <div className="code-block-wrapper">
          <div className="code-block-header">
            <span className="code-lang">{lang}</span>
            <button className="copy-btn" onClick={() => copyCode(content, key)}>
              {copiedIdx === key ? "Disalin!" : "Salin"}
            </button>
          </div>
          <div className="code-block-body">
            <SyntaxHighlighter
              language={lang}
              style={oneDark}
              wrapLongLines={true}
              customStyle={{
                margin: 0,
                borderRadius: "0",
                padding: "12px 14px",
                fontSize: "12px",
                lineHeight: "1.5",
                background: "transparent",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
              codeTagProps={{
                style: {
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                  fontFamily: '"JetBrains Mono", monospace',
                },
              }}
            >
              {content}
            </SyntaxHighlighter>
          </div>
        </div>
      );
    },
  };

  function clearChat() {
    if (window.confirm("Adakah anda pasti mahu memadamkan semua sejarah chat?")) {
      setChat([]);
      setError(null);
    }
  }

  return (
    <div className="app-container">
      <div className="app">
        <header className="top">
          <div className="mark">
            <div className="mark-core" />
          </div>
          <div className="header-info">
            <h1>Nexa</h1>
            <p>Powered by Multiple AI</p>
          </div>
          <button
            className="settings-toggle-btn"
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Settings"
          >
            ☰
          </button>
        </header>

        {showSettings && (
          <div className="settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="settings-header">
                <h2>Tetapan</h2>
                <button className="settings-close-btn" onClick={() => setShowSettings(false)}>×</button>
              </div>
              <div className="settings-body">
                <div className="settings-row">
                  <div className="settings-label-group">
                    <label className="settings-label">Ingatan Chat (Memory)</label>
                    <p className="settings-desc">Kenang mesej-mesej terdahulu untuk respon yang bersambung.</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={memoryEnabled}
                      onChange={(e) => setMemoryEnabled(e.target.checked)}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div className="settings-row border-top">
                  <div className="settings-label-group">
                    <label className="settings-label">Padam Sejarah</label>
                    <p className="settings-desc">Padam semua mesej dalam sejarah chat semasa dari peranti anda.</p>
                  </div>
                  <button className="danger-btn" onClick={clearChat}>Padam</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="chat">
          {chat.length === 0 && !load && (
            <div className="empty-state">
              <div className="empty-mark">
                <div className="mark-core" />
              </div>
              <p>Tanya apa sahaja. Saya sedia bantu.</p>
            </div>
          )}

          {chat.map((c, i) => (
            <div key={i} className={`row row-${c.type}`}>
              <div className={c.type}>
                {c.type === "ai" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                    {c.text}
                  </ReactMarkdown>
                ) : (
                  <p className="msg-text">{c.text}</p>
                )}
              </div>
            </div>
          ))}

          {load && (
            <div className="row row-ai">
              <div className="ai">
                <div className="nexa-loading">
                  <div className="nexa-loader">
                    <div className="nexa-blob" />
                    <div className="nexa-blob" />
                    <div className="nexa-blob" />
                  </div>
                  <span className="loading-text">{statusText}</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </main>

        {error && <div className="error-banner">{error}</div>}

        <footer className="inputBox">
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tanya sesuatu..."
            disabled={load}
          />
          <button className="send-btn" onClick={send} disabled={load || !msg.trim()} aria-label="Hantar">
            ➤
          </button>
        </footer>
      </div>
    </div>
  );
}

export default App;
