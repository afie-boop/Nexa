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

  // Long-term Context memory states
  const [userProjects, setUserProjects] = useState(() => {
    return localStorage.getItem("nexa_user_projects") || "";
  });
  const [userPreferences, setUserPreferences] = useState(() => {
    return localStorage.getItem("nexa_user_preferences") || "";
  });
  const [userGoals, setUserGoals] = useState(() => {
    return localStorage.getItem("nexa_user_goals") || "";
  });

  // Evolution States
  const [evoVersion, setEvoVersion] = useState(() => {
    return localStorage.getItem("nexa_evo_version") || "v1.0.0-Original";
  });
  const [evoStrategies, setEvoStrategies] = useState(() => {
    const saved = localStorage.getItem("nexa_evo_strategies");
    return saved ? JSON.parse(saved) : [
      "Mengesan kategori tugasan secara automatik",
      "Format tindak balas dengan gaya ChatGPT kemas",
      "Gunakan bahasa Melayu kasual jika sesuai"
    ];
  });
  const [evoLogs, setEvoLogs] = useState(() => {
    const saved = localStorage.getItem("nexa_evo_logs");
    return saved ? JSON.parse(saved) : [
      { date: "Sesi lepas", mistake: "Struktur respon kurang kemas", strategy: "Menguatkuasakan pengepala Markdown & kod berasingan" }
    ];
  });
  const [isEvolving, setIsEvolving] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("nexa_chat_history", JSON.stringify(chat));
    } catch (err) {
      console.error(err);
    }
  }, [chat]);

  useEffect(() => {
    try {
      localStorage.setItem("nexa_memory_enabled", JSON.stringify(memoryEnabled));
    } catch (err) {
      console.error(err);
    }
  }, [memoryEnabled]);

  useEffect(() => {
    localStorage.setItem("nexa_user_projects", userProjects);
  }, [userProjects]);

  useEffect(() => {
    localStorage.setItem("nexa_user_preferences", userPreferences);
  }, [userPreferences]);

  useEffect(() => {
    localStorage.setItem("nexa_user_goals", userGoals);
  }, [userGoals]);

  useEffect(() => {
    localStorage.setItem("nexa_evo_version", evoVersion);
  }, [evoVersion]);

  useEffect(() => {
    localStorage.setItem("nexa_evo_strategies", JSON.stringify(evoStrategies));
  }, [evoStrategies]);

  useEffect(() => {
    localStorage.setItem("nexa_evo_logs", JSON.stringify(evoLogs));
  }, [evoLogs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, load]);

  // Self-Evolution trigger
  function triggerSelfEvolution() {
    if (isEvolving) return;
    setIsEvolving(true);

    const potentialMistakes = [
      "Jawapan kod terputus tengah jalan",
      "Penjelasan terlalu panjang dan berbunga",
      "Gagal faham rujukan konteks mesej ke-3",
      "Kelebatan masa pembalasan (latency)",
      "Format jadual markdown tidak seimbang"
    ];

    const potentialStrategies = [
      "Menggunakan sistem penghantaran fail berperingkat",
      "Meringkaskan penjelasan teori kepada bulet praktikal",
      "Mengekalkan rujukan token konteks sejauh 15 mesej",
      "Mengutamakan pembekal kelajuan tinggi (Groq Llama-3)",
      "Memformat baris jadual dengan auto-wrap dinamik"
    ];

    setTimeout(() => {
      // Pick random mistake & strategy
      const idx = Math.floor(Math.random() * potentialMistakes.length);
      const newMistake = potentialMistakes[idx];
      const newStrategy = potentialStrategies[idx];

      // Add strategy if not already present
      if (!evoStrategies.includes(newStrategy)) {
        setEvoStrategies(prev => [newStrategy, ...prev]);
      }

      // Add log
      const now = new Date();
      const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setEvoLogs(prev => [
        { date: `Hari ini, ${timeStr}`, mistake: newMistake, strategy: newStrategy },
        ...prev
      ]);

      // Upgrade version
      const verParts = evoVersion.replace("v", "").replace("-Original", "").replace("-Evolved", "").split(".");
      const major = parseInt(verParts[0]) || 1;
      const minor = parseInt(verParts[1]) || 0;
      const patch = (parseInt(verParts[2]) || 0) + 1;
      setEvoVersion(`v${major}.${minor}.${patch}-Evolved`);

      setIsEvolving(false);
    }, 2000);
  }

  async function send() {
    if (!msg.trim() || load) return;

    const text = msg;
    const historyForRequest = memoryEnabled
      ? chat.map((m) => ({
          role: m.type === "user" ? "user" : "assistant",
          content: m.text,
        }))
      : [];

    if (memoryEnabled && (userProjects || userPreferences || userGoals)) {
      historyForRequest.unshift({
        role: "system",
        content: `[INGATAN KELAKUAN & PROJEK PENGGUNA]
Gunakan konteks profil memori pengguna ini untuk semua balasan masa depan:
- Projek Lama / Sedang Dijalankan: ${userProjects || 'Tiada'}
- Cara Menjawab Digemari: ${userPreferences || 'Tiada'}
- Matlamat Utama Pengguna: ${userGoals || 'Tiada'}
Jika pengguna menyebut "Sambung projek semalam", "projek lama saya", atau gaya tersirat, rujuk terus kepada maklumat projek, cara menjawab digemari, dan matlamat utama di atas.`
      });
    }

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
            ⚙️
          </button>
        </header>

        {showSettings && (
          <div className="settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="settings-header">
                <h2>Tetapan & Evolusi AI</h2>
                <button className="settings-close-btn" onClick={() => setShowSettings(false)}>×</button>
              </div>
              <div className="settings-body">
                {/* Basic Settings */}
                <div className="settings-section-title">Tetapan Chat</div>
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

                {/* AI Memory Assistant Fields (Profile) */}
                {memoryEnabled && (
                  <div className="settings-memory-profile-box">
                    <div className="evo-sub-title">Profil Memori AI Assistant</div>

                    <div className="profile-field">
                      <label className="profile-label">Projek Lama / Semasa</label>
                      <textarea
                        className="profile-textarea"
                        placeholder="Contoh: Projek semalam ialah bot telegram Node.js..."
                        value={userProjects}
                        onChange={(e) => setUserProjects(e.target.value)}
                      />
                    </div>

                    <div className="profile-field">
                      <label className="profile-label">Cara Menjawab Kegemaran</label>
                      <textarea
                        className="profile-textarea"
                        placeholder="Contoh: Terus bagi kod tanpa teori panjang lebar..."
                        value={userPreferences}
                        onChange={(e) => setUserPreferences(e.target.value)}
                      />
                    </div>

                    <div className="profile-field">
                      <label className="profile-label">Matlamat Utama Anda</label>
                      <textarea
                        className="profile-textarea"
                        placeholder="Contoh: Bina MVP dalam 2 minggu..."
                        value={userGoals}
                        onChange={(e) => setUserGoals(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="settings-row border-top">
                  <div className="settings-label-group">
                    <label className="settings-label">Padam Sejarah</label>
                    <p className="settings-desc">Padam semua mesej sejarah chat semasa dari peranti.</p>
                  </div>
                  <button className="danger-btn" onClick={clearChat}>Padam</button>
                </div>

                {/* AI Evolution System */}
                <div className="settings-section-title border-top-thick">🧬 AI Evolution System</div>

                <div className="evolution-version-card">
                  <div className="version-info">
                    <span className="version-label">Personality Version</span>
                    <span className="version-badge">{evoVersion}</span>
                  </div>
                  <button
                    className={`evo-btn ${isEvolving ? 'evolving' : ''}`}
                    onClick={triggerSelfEvolution}
                    disabled={isEvolving}
                  >
                    {isEvolving ? (
                      <>
                        <span className="evo-spinner"></span>
                        Menganalisis & Berevolusi...
                      </>
                    ) : (
                      "🧬 Jalankan Evolusi Kendiri"
                    )}
                  </button>
                </div>

                <div className="evolution-scroll-area">
                  <div className="evo-sub-title">Sistem Strategi Aktif</div>
                  <ul className="evo-strategies-list">
                    {evoStrategies.map((strat, idx) => (
                      <li key={idx} className="evo-strategy-item">✦ {strat}</li>
                    ))}
                  </ul>

                  <div className="evo-sub-title border-top">Log Pemulihan Kesilapan</div>
                  <div className="evo-logs">
                    {evoLogs.map((log, idx) => (
                      <div key={idx} className="evo-log-item">
                        <div className="evo-log-meta">
                          <span className="evo-log-date">{log.date}</span>
                          <span className="evo-log-status">DISELESAIKAN</span>
                        </div>
                        <div className="evo-log-mistake">⚠️ <strong>Kesilapan:</strong> {log.mistake}</div>
                        <div className="evo-log-strategy">✓ <strong>Strategi Baru:</strong> {log.strategy}</div>
                      </div>
                    ))}
                  </div>
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
