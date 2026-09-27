import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

function App() {
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState([]);
  const [load, setLoad] = useState(false);
  const [error, setError] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [truncatedMap, setTruncatedMap] = useState({});
  const [expandedCode, setExpandedCode] = useState(null);
  const codeRefs = useRef({});
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, load]);

  useEffect(() => {
    const newTruncated = {};
    Object.entries(codeRefs.current).forEach(([key, el]) => {
      if (el && el.scrollHeight > el.clientHeight + 2) {
        newTruncated[key] = true;
      }
    });
    setTruncatedMap(newTruncated);
  }, [chat]);

  async function send() {
    // Guard: kosong ATAU sedang loading -> tak boleh hantar (elak double-send)
    if (!msg.trim() || load) return;

    const text = msg;
    const historyForRequest = chat.map((m) => ({
      role: m.type === "user" ? "user" : "assistant",
      content: m.text,
    }));

    setChat((prev) => [...prev, { type: "user", text }]);
    setMsg("");
    setLoad(true);
    setError(null);

    try {
      const res = await fetch("https://nexa-2fnl.onrender.com/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: historyForRequest }),
      });

      if (!res.ok) {
        throw new Error(`Server balas status ${res.status}`);
      }

      const data = await res.json();

      setChat((prev) => [...prev, { type: "ai", text: data.answer }]);
    } catch (err) {
      // Fix: sebelum ni kalau fetch gagal, loading akan stuck selama-lamanya
      setError("Gagal hubungi server. Cuba refresh — server mungkin baru 'bangun' dari sleep.");
      setChat((prev) => [
        ...prev,
        { type: "ai", text: "⚠️ Maaf, saya tak dapat balas sekarang. Sila cuba lagi." },
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

  function parseMessage(text) {
    const regex = /```(\w*)\n?([\s\S]*?)```/g;
    const segments = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      segments.push({ type: "code", lang: match[1] || "text", content: match[2] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      segments.push({ type: "text", content: text.slice(lastIndex) });
    }
    return segments;
  }

  function copyCode(content, key) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(key);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  }

  return (
    <div className="app">
      <div className="top">
        <div className="mark">
          <span className="mark-cyan" />
          <span className="mark-coral" />
        </div>
        <div>
          <h1>Nexa</h1>
          <p>Auto Multi AI Agent</p>
        </div>
      </div>

      <div className="chat">
        {chat.length === 0 && !load && (
          <div className="empty-state">
            <div className="empty-mark">
              <span className="mark-cyan" />
              <span className="mark-coral" />
            </div>
            <p>Tanya apa sahaja. Saya sedia bantu.</p>
          </div>
        )}

        {chat.map((c, i) => (
          <div key={i} className={`row row-${c.type}`}>
            <div className={c.type}>
              {c.text &&
                parseMessage(c.text).map((seg, idx) => {
                  const key = `${i}-${idx}`;
                  return seg.type === "code" ? (
                    <div key={key} className="code-block-wrapper">
                      <div className="code-block-header">
                        <span className="code-lang">{seg.lang}</span>
                        <button
                          className="copy-btn"
                          onClick={() => copyCode(seg.content, key)}
                        >
                          {copiedIdx === key ? "Disalin!" : "Salin"}
                        </button>
                      </div>
                      <div
                        className="code-block-body"
                        ref={(el) => (codeRefs.current[key] = el)}
                        onClick={() =>
                          truncatedMap[key] &&
                          setExpandedCode({ lang: seg.lang, content: seg.content })
                        }
                        style={{ cursor: truncatedMap[key] ? "pointer" : "default" }}
                      >
                        <SyntaxHighlighter
                          language={seg.lang}
                          style={oneDark}
                          customStyle={{
                            margin: 0,
                            borderRadius: "0 0 10px 10px",
                            fontSize: "12.5px",
                            whiteSpace: "pre-wrap",
                            overflowWrap: "break-word",
                          }}
                          codeTagProps={{
                            style: {
                              whiteSpace: "pre-wrap",
                              overflowWrap: "break-word",
                            },
                          }}
                        >
                          {seg.content}
                        </SyntaxHighlighter>
                        {truncatedMap[key] && (
                          <div className="code-fade">Ketuk untuk lihat penuh</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    seg.content.trim() && (
                      <p key={key} className="msg-text">
                        {seg.content}
                      </p>
                    )
                  );
                })}
            </div>
          </div>
        ))}

        {load && (
          <div className="row row-ai">
            <div className="ai typing">
              <span className="typing-label">AI sedang berfikir</span>
              <span className="core" />
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {chat.length === 0 && !load && (
        <div className="quick-prompts" aria-label="Cadangan">
          <button className="quick-prompt" onClick={() => setMsg("Bina Kod Fibonacci")}>
            Bina Kod Fibonacci
          </button>
          <button className="quick-prompt" onClick={() => setMsg("Strategi Pemasaran")}>
            Strategi Pemasaran
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="inputBox">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tanya sesuatu..."
          disabled={load}
        />
        <button onClick={send} disabled={load || !msg.trim()} aria-label="Hantar">
          ➤
        </button>
      </div>

      {expandedCode && (
        <div className="code-modal-overlay" onClick={() => setExpandedCode(null)}>
          <div className="code-modal" onClick={(e) => e.stopPropagation()}>
            <div className="code-modal-header">
              <span className="code-lang">{expandedCode.lang}</span>
              <button
                className="code-modal-close"
                onClick={() => setExpandedCode(null)}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            <div className="code-modal-body">
              <SyntaxHighlighter
                language={expandedCode.lang}
                style={oneDark}
                customStyle={{
                  margin: 0,
                  fontSize: "13px",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "break-word",
                }}
                codeTagProps={{
                  style: { whiteSpace: "pre-wrap", overflowWrap: "break-word" },
                }}
              >
                {expandedCode.content}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
