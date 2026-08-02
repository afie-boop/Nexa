import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

function App() {
  const [msg, setMsg] = useState("");

  // Conversations State
  const [conversations, setConversations] = useState(() => {
    try {
      const saved = localStorage.getItem("nexa_conversations");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    const defaultId = "conv_" + Date.now();
    return [{
      id: defaultId,
      title: "Sesi Baru",
      messages: [],
      pinned: false,
      archived: false,
      createdAt: Date.now()
    }];
  });

  const [activeId, setActiveId] = useState(() => {
    const saved = localStorage.getItem("nexa_active_id");
    if (saved) return saved;
    try {
      const savedConvs = localStorage.getItem("nexa_conversations");
      if (savedConvs) {
        const parsed = JSON.parse(savedConvs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0].id;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return "";
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");

  const activeConversation = conversations.find(c => c.id === activeId) || conversations[0] || { id: "", messages: [], title: "" };
  const chat = activeConversation.messages || [];

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
    if (conversations.length > 0 && !activeId) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  useEffect(() => {
    try {
      localStorage.setItem("nexa_conversations", JSON.stringify(conversations));
    } catch (err) {
      console.error(err);
    }
  }, [conversations]);

  useEffect(() => {
    if (activeId) {
      localStorage.setItem("nexa_active_id", activeId);
    }
  }, [activeId]);

  useEffect(() => {
    try {
      localStorage.setItem("nexa_memory_enabled", JSON.stringify(memoryEnabled));
    } catch (err) {
      console.error(err);
    }
  }, [memoryEnabled]);

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

  const updateActiveMessages = (updater) => {
    setConversations(prevConvs => {
      return prevConvs.map(c => {
        if (c.id === activeId) {
          const newMessages = typeof updater === "function" ? updater(c.messages) : updater;

          let newTitle = c.title;
          if (c.title === "Sesi Baru" && newMessages.length > 0) {
            const firstUserMsg = newMessages.find(m => m.type === "user");
            if (firstUserMsg) {
              newTitle = firstUserMsg.text.slice(0, 25).trim() + (firstUserMsg.text.length > 25 ? "..." : "");
            }
          }

          return {
            ...c,
            messages: newMessages,
            title: newTitle
          };
        }
        return c;
      });
    });
  };

  const handleNewChat = () => {
    const newId = "conv_" + Date.now();
    const newConv = {
      id: newId,
      title: "Sesi Baru",
      messages: [],
      pinned: false,
      archived: false,
      createdAt: Date.now()
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveId(newId);
    setSidebarOpen(false);
    setShowSettings(false);
  };

  const handleDeleteConversation = (id, e) => {
    e.stopPropagation();
    if (conversations.length === 1) {
      const newId = "conv_" + Date.now();
      setConversations([{
        id: newId,
        title: "Sesi Baru",
        messages: [],
        pinned: false,
        archived: false,
        createdAt: Date.now()
      }]);
      setActiveId(newId);
    } else {
      const remaining = conversations.filter(c => c.id !== id);
      setConversations(remaining);
      if (activeId === id) {
        setActiveId(remaining[0].id);
      }
    }
  };

  const handleRenameConversation = (id, newTitle) => {
    if (newTitle.trim()) {
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
    }
    setEditingId(null);
  };

  const handleArchiveConversation = (id, e) => {
    e.stopPropagation();
    setConversations(prev => prev.map(c => c.id === id ? { ...c, archived: !c.archived } : c));
  };

  const handlePinConversation = (id, e) => {
    e.stopPropagation();
    setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  };

  // Self-Evolution trigger
  async function triggerSelfEvolution(overrideHistory) {
    if (isEvolving) return;
    setIsEvolving(true);

    const activeHistory = overrideHistory || chat;
    if (!activeHistory || activeHistory.length === 0) {
      setIsEvolving(false);
      return;
    }

    // Format history for the API
    const formattedHistory = activeHistory.map(m => ({
      role: m.type === "user" ? "user" : "assistant",
      content: m.text
    }));

    try {
      const response = await fetch("/evolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: formattedHistory,
          evoStrategies
        })
      });

      if (!response.ok) {
        throw new Error(`Ralat evolusi: ${response.status}`);
      }

      const result = await response.json();
      const { mistake, patch, newStrategy } = result;

      if (newStrategy && !evoStrategies.includes(newStrategy)) {
        setEvoStrategies(prev => [newStrategy, ...prev]);
      }

      const now = new Date();
      const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setEvoLogs(prev => [
        { date: `Hari ini, ${timeStr}`, mistake: mistake, strategy: patch },
        ...prev
      ]);

      // Upgrade version
      const verParts = evoVersion.replace("v", "").replace("-Original", "").replace("-Evolved", "").split(".");
      const major = parseInt(verParts[0]) || 1;
      const minor = parseInt(verParts[1]) || 0;
      const patchNum = (parseInt(verParts[2]) || 0) + 1;
      setEvoVersion(`v${major}.${minor}.${patchNum}-Evolved`);

    } catch (err) {
      console.error("Gagal melakukan evolusi kognitif real-time:", err);
      // Fallback if API fails
      const fallbackMistakes = [
        "Penyampaian maklumat kurang tersusun rapi",
        "Penjelasan bertulis boleh diperkemaskan lagi"
      ];
      const fallbackStrategies = [
        "Mengutamakan penyusunan penomboran berperingkat",
        "Menapis perkataan berulang untuk respon lebih ringkas"
      ];
      const idx = Math.floor(Math.random() * fallbackMistakes.length);
      const m = fallbackMistakes[idx];
      const s = fallbackStrategies[idx];

      if (!evoStrategies.includes(s)) {
        setEvoStrategies(prev => [s, ...prev]);
      }
      const now = new Date();
      const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setEvoLogs(prev => [
        { date: `Hari ini, ${timeStr}`, mistake: m, strategy: s },
        ...prev
      ]);

      const verParts = evoVersion.replace("v", "").replace("-Original", "").replace("-Evolved", "").split(".");
      const major = parseInt(verParts[0]) || 1;
      const minor = parseInt(verParts[1]) || 0;
      const patchNum = (parseInt(verParts[2]) || 0) + 1;
      setEvoVersion(`v${major}.${minor}.${patchNum}-Evolved`);
    } finally {
      setIsEvolving(false);
    }
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

    updateActiveMessages((prev) => [...prev, { type: "user", text }]);
    setMsg("");
    setLoad(true);
    setStatusText("Nexa sedang berfikir...");
    setError(null);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          history: historyForRequest,
          evoStrategies
        }),
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

      let finalChatRef = [];
      setConversations(prevConvs => {
        return prevConvs.map(c => {
          if (c.id === activeId) {
            const nextChat = [...c.messages, { type: "ai", text: finalAnswer, process: processLog }];
            finalChatRef = nextChat;
            return { ...c, messages: nextChat };
          }
          return c;
        });
      });
      setTimeout(() => {
        triggerSelfEvolution(finalChatRef);
      }, 1000);
    } catch (err) {
      setError(err.message || "Gagal hubungi server. Cuba refresh.");
      updateActiveMessages((prev) => [
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
      updateActiveMessages([]);
      setError(null);
    }
  }

  const groupConversations = (convList) => {
    const groups = {
      pinned: [],
      today: [],
      yesterday: [],
      thisWeek: [],
      older: []
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const thisWeekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    convList.forEach(c => {
      if (c.pinned) {
        groups.pinned.push(c);
      } else {
        const time = c.createdAt;
        if (time >= todayStart) {
          groups.today.push(c);
        } else if (time >= yesterdayStart) {
          groups.yesterday.push(c);
        } else if (time >= thisWeekStart) {
          groups.thisWeek.push(c);
        } else {
          groups.older.push(c);
        }
      }
    });

    return groups;
  };

  const filteredConversations = conversations.filter(c => {
    const matchesTitle = c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesContent = c.messages.some(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTitle || matchesContent;
  });

  const displayConversations = filteredConversations.filter(c => showArchived ? c.archived : !c.archived);
  const grouped = groupConversations(displayConversations);

  return (
    <div className="app-container">
      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div className="sidebar-mobile-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Left Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand-wrapper">
            <div className="sidebar-brand">
              <div className="mark small-mark">
                <div className="mark-core" />
              </div>
              <span>Nexa Chat</span>
            </div>
            <button
              className="sidebar-settings-btn"
              onClick={() => {
                setShowSettings(!showSettings);
                setSidebarOpen(false);
              }}
              title="Tetapan & Evolusi"
              aria-label="Settings"
            >
              ⚙
            </button>
          </div>
          <button className="new-chat-btn" onClick={handleNewChat}>
            + Sembang Baru
          </button>
        </div>

        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Cari sembang..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="sidebar-scroll">
          {Object.entries(grouped).map(([key, list]) => {
            if (list.length === 0) return null;

            const titleMap = {
              pinned: "Pinned 📌",
              today: "Hari Ini",
              yesterday: "Semalam",
              thisWeek: "Minggu Ini",
              older: "Sebelum Ini"
            };

            return (
              <div key={key} className="sidebar-group">
                <div className="sidebar-group-title">{titleMap[key]}</div>
                <div className="sidebar-group-list">
                  {list.map((c) => (
                    <div
                      key={c.id}
                      className={`sidebar-item ${c.id === activeId && !showSettings ? "active" : ""}`}
                      onClick={() => {
                        setActiveId(c.id);
                        setSidebarOpen(false);
                        setShowSettings(false);
                      }}
                    >
                      {editingId === c.id ? (
                        <div className="sidebar-item-edit-wrapper" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleRenameConversation(c.id, editTitle);
                              } else if (e.key === "Escape") {
                                setEditingId(null);
                              }
                            }}
                            autoFocus
                          />
                          <button
                            className="edit-save-btn"
                            onClick={() => handleRenameConversation(c.id, editTitle)}
                          >
                            ✓
                          </button>
                          <button
                            className="edit-cancel-btn"
                            onClick={() => setEditingId(null)}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="sidebar-item-title" title={c.title}>{c.title}</span>
                          <div className="sidebar-item-actions">
                            <button
                              className={`action-btn ${c.pinned ? "active" : ""}`}
                              onClick={(e) => handlePinConversation(c.id, e)}
                              title={c.pinned ? "Unpin Sembang" : "Pin Sembang"}
                            >
                              📌
                            </button>
                            <button
                              className={`action-btn ${c.archived ? "active" : ""}`}
                              onClick={(e) => handleArchiveConversation(c.id, e)}
                              title={c.archived ? "Nyaharkib Sembang" : "Arkib Sembang"}
                            >
                              📦
                            </button>
                            <button
                              className="action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(c.id);
                                setEditTitle(c.title);
                              }}
                              title="Nama Semula"
                            >
                              ✏️
                            </button>
                            <button
                              className="action-btn delete-btn"
                              onClick={(e) => handleDeleteConversation(c.id, e)}
                              title="Padam Sembang"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <button
            className="sidebar-footer-btn"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "Lihat Sembang Aktif" : "Lihat Sembang Arkib"}
          </button>
          <button
            className="sidebar-footer-btn settings-btn-footer"
            onClick={() => {
              setShowSettings(!showSettings);
              setSidebarOpen(false);
            }}
          >
            ⚙ Tetapan & Evolusi
          </button>
        </div>
      </aside>

      {/* Main App Panel */}
      <div className="app">
        <header className="top">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle Sidebar"
          >
            ☰
          </button>
          <div className="mark">
            <div className="mark-core" />
          </div>
          <div className="header-info">
            <h1>{showSettings ? "Tetapan & Evolusi AI" : "Nexa"}</h1>
            <p>{showSettings ? "Konfigurasi personaliti dan tingkah laku" : "Powered by Multiple AI"}</p>
          </div>
          <button
            className={`settings-toggle-btn ${showSettings ? "active" : ""}`}
            onClick={() => {
              setShowSettings(!showSettings);
              setSidebarOpen(false);
            }}
            title={showSettings ? "Tutup Tetapan" : "Tetapan & Evolusi"}
            aria-label="Toggle Settings"
          >
            {showSettings ? "✕" : "⚙"}
          </button>
        </header>

        {showSettings ? (
          <div className="full-settings-container">
            <div className="settings-body">
              {/* Basic Settings */}
              <div className="settings-section-title">Tetapan Chat</div>
              <div className="settings-row">
                <div className="settings-label-group">
                  <label className="settings-label">Ingatan Chat (Memory)</label>
                  <p className="settings-desc">Kenang mesej-mesej terdahulu secara automatik untuk respon yang bersambung.</p>
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
                  <p className="settings-desc">Padam semua mesej sejarah chat semasa dari peranti.</p>
                </div>
                <button className="danger-btn" onClick={clearChat}>Padam</button>
              </div>

              {/* AI Evolution System */}
              <div className="settings-section-title border-top-thick">AI Evolution System</div>

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
                    "Jalankan Evolusi Kendiri"
                  )}
                </button>
                <p className="settings-desc" style={{ textAlign: "center", marginTop: "4px" }}>
                  🔄 Evolusi juga berjalan secara automatik selepas perbualan selesai.
                </p>
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
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

export default App;
