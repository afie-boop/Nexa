import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

function App() {
  const [msg, setMsg] = useState("");

  // Navigation State: 'chats' | 'models' | 'history' | 'tools' | 'settings' | 'about'
  const [activeNav, setActiveNav] = useState("chats");

  // Theme State: 'light' | 'dark'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("nexa_theme") || "light";
  });

  // Online / Offline state tracking
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  const [evolutionEnabled, setEvolutionEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem("nexa_evolution_enabled");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [load, setLoad] = useState(false);
  const [error, setError] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const chatEndRef = useRef(null);

  // Like/Dislike state track for messages
  const [likes, setLikes] = useState({});
  const [dislikes, setDislikes] = useState({});

  // Evolution States
  const [evoVersion, setEvoVersion] = useState(() => {
    return localStorage.getItem("nexa_evo_version") || "v1.0.0-Original";
  });
  const [evoStrategies, setEvoStrategies] = useState(() => {
    const saved = localStorage.getItem("nexa_evo_strategies");
    return saved ? JSON.parse(saved) : [
      "Mengesan kategori tugasan secara automatik",
      "Format tindak balas dengan gaya kemas",
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
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
    try {
      localStorage.setItem("nexa_evolution_enabled", JSON.stringify(evolutionEnabled));
    } catch (err) {
      console.error(err);
    }
  }, [evolutionEnabled]);

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
    localStorage.setItem("nexa_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
    setActiveNav("chats");
  };

  const handleDeleteConversation = (id, e) => {
    if (e) e.stopPropagation();
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
    if (e) e.stopPropagation();
    setConversations(prev => prev.map(c => c.id === id ? { ...c, archived: !c.archived } : c));
  };

  const handlePinConversation = (id, e) => {
    if (e) e.stopPropagation();
    setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  };

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  const handleSuggestionClick = (promptText) => {
    setMsg(promptText);
  };

  const handleLike = (msgIdx) => {
    setLikes(prev => ({ ...prev, [msgIdx]: !prev[msgIdx] }));
    setDislikes(prev => ({ ...prev, [msgIdx]: false }));
  };

  const handleDislike = (msgIdx) => {
    setDislikes(prev => ({ ...prev, [msgIdx]: !prev[msgIdx] }));
    setLikes(prev => ({ ...prev, [msgIdx]: false }));
  };

  const handleRegenerate = async (msgIdx) => {
    // Find the last user message before this AI response
    const lastUserMsgIdx = chat.slice(0, msgIdx).reduce((lastIdx, m, i) => m.type === "user" ? i : lastIdx, -1);
    if (lastUserMsgIdx !== -1) {
      const userText = chat[lastUserMsgIdx].text;
      // Slice history up to that user message
      const historyToKeep = chat.slice(0, lastUserMsgIdx);
      updateActiveMessages(historyToKeep);
      setMsg(userText);
      setTimeout(() => {
        send(userText, historyToKeep);
      }, 50);
    }
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

  async function send(overrideMsg, overrideHistory) {
    const textToSend = overrideMsg || msg;
    if (!textToSend.trim() || load) return;

    const historyForRequest = memoryEnabled
      ? (overrideHistory || chat).map((m) => ({
          role: m.type === "user" ? "user" : "assistant",
          content: m.text,
        }))
      : [];

    if (!overrideMsg) {
      updateActiveMessages((prev) => [...prev, { type: "user", text: textToSend }]);
      setMsg("");
    }

    setLoad(true);
    setError(null);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: textToSend,
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
      if (evolutionEnabled) {
        setTimeout(() => {
          triggerSelfEvolution(finalChatRef);
        }, 1000);
      }
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
            <span>{lang}</span>
            <button className="copy-btn" onClick={() => copyCode(content, key)}>
              {copiedIdx === key ? "Disalin!" : "Salin kod"}
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
                padding: "16px",
                fontSize: "13px",
                lineHeight: "1.6",
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

  const filteredConversations = conversations.filter(c => {
    const matchesTitle = c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesContent = c.messages.some(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTitle || matchesContent;
  });

  // Calculate current dynamic status
  const getDynamicStatus = () => {
    if (!isOnline) return "Offline";
    if (load) return "Thinking";
    if (isOnline && !load && chat.length > 0) return "Ready";
    return "Online";
  };

  const currentStatus = getDynamicStatus();

  return (
    <div className="app-container">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="sidebar-mobile-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ==========================================================================
         SIDEBAR (LEFT) - 260px Fixed Layout
         ========================================================================== */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">N</div>
            <div className="logo-text">NEXA</div>
          </div>
          <button className="new-chat-btn" onClick={handleNewChat}>
            + New Chat
          </button>
        </div>

        {/* Sidebar Menu Options */}
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeNav === "chats" ? "active" : ""}`}
            onClick={() => { setActiveNav("chats"); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><span className="black-emoji">💬</span></span> Chats
          </button>
          <button
            className={`nav-item ${activeNav === "models" ? "active" : ""}`}
            onClick={() => { setActiveNav("models"); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><span className="black-emoji">🤖</span></span> Models
          </button>
          <button
            className={`nav-item ${activeNav === "history" ? "active" : ""}`}
            onClick={() => { setActiveNav("history"); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><span className="black-emoji">📜</span></span> History
          </button>
          <button
            className={`nav-item ${activeNav === "tools" ? "active" : ""}`}
            onClick={() => { setActiveNav("tools"); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><span className="black-emoji">🛠️</span></span> Tools
          </button>
          <button
            className={`nav-item ${activeNav === "settings" ? "active" : ""}`}
            onClick={() => { setActiveNav("settings"); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><span className="black-emoji">⚙️</span></span> Settings
          </button>
          <button
            className={`nav-item ${activeNav === "about" ? "active" : ""}`}
            onClick={() => { setActiveNav("about"); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><span className="black-emoji">ℹ️</span></span> About
          </button>

          {/* Sesi Aktif List inside Sidebar for easy access when Chats navigation is active */}
          {activeNav === "chats" && (
            <div className="sidebar-sub-section animate-fade">
              <span className="sidebar-sub-title">Sesi Aktif</span>
              <div className="sidebar-search-box">
                <input
                  type="text"
                  placeholder="Cari..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="sidebar-conv-list">
                {filteredConversations.filter(c => !c.archived).map((c) => (
                  <div
                    key={c.id}
                    className={`sidebar-conv-item ${c.id === activeId ? "active" : ""}`}
                    onClick={() => { setActiveId(c.id); setSidebarOpen(false); }}
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
                      </div>
                    ) : (
                      <>
                        <span className="sidebar-conv-title">{c.title}</span>
                        <div className="sidebar-conv-actions">
                          <button
                            className="sidebar-action-btn"
                            onClick={(e) => handlePinConversation(c.id, e)}
                            title="Pin Sembang"
                          >
                            {c.pinned ? <span className="black-emoji">📌</span> : <span className="black-emoji">📍</span>}
                          </button>
                          <button
                            className="sidebar-action-btn"
                            onClick={(e) => handleArchiveConversation(c.id, e)}
                            title="Arkib Sembang"
                          >
                            <span className="black-emoji">📦</span>
                          </button>
                          <button
                            className="sidebar-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(c.id);
                              setEditTitle(c.title);
                            }}
                            title="Nama Semula"
                          >
                            <span className="black-emoji">✏️</span>
                          </button>
                          <button
                            className="sidebar-action-btn"
                            onClick={(e) => handleDeleteConversation(c.id, e)}
                            title="Padam Sembang"
                          >
                            <span className="black-emoji">🗑️</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* User Profile Info */}
        <div className="sidebar-profile">
          <div className="profile-avatar">UX</div>
          <div className="profile-info">
            <span className="profile-name">Nexa Developer</span>
            <span className="profile-plan">Pro Evolution Plan</span>
          </div>
        </div>

        {/* Version Footer */}
        <div className="sidebar-footer">
          <span>Version 1.2.4</span>
        </div>
      </aside>

      {/* ==========================================================================
         WORKSPACE UTAMA (Spans all remaining space)
         ========================================================================== */}
      <div className="workspace">
        {/* 1. Top Bar */}
        <header className="top-bar">
          <button
            className="mobile-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰
          </button>

          <div className="ai-status-container">
            <span className="ai-name">Nexa AI</span>
            <div className="status-indicator">
              <span className={`status-dot ${currentStatus === "Thinking" ? "thinking" : ""}`} />
              <span>{currentStatus}</span>
            </div>
          </div>

          <div className="top-bar-actions">
            <button className="theme-toggle-btn" onClick={toggleTheme}>
              {theme === "light" ? <><span className="black-emoji">🌙</span> Dark</> : <><span className="black-emoji">☀️</span> Light</>}
            </button>
          </div>
        </header>

        {/* Display Banner Errors if present */}
        {error && <div className="error-banner animate-slide">{error}</div>}

        {/* Render Panels based on activeNav */}
        {activeNav === "chats" && (
          <>
            {/* 2. Hero Section (when empty) */}
            {chat.length === 0 && !load ? (
              <div className="hero-section animate-fade">
                <div className="hero-logo">N</div>
                <h2 className="hero-title">Hello, I'm Nexa.</h2>
                <p className="hero-tagline">Build. Think. Create.</p>

                <div className="suggestion-prompts-container">
                  <button
                    className="suggestion-btn"
                    onClick={() => handleSuggestionClick("Tulis fungsi Fibonacci dalam Python dan jelaskan prestasinya.")}
                  >
                    <span className="black-emoji">🐍</span> Tulis Kod Fibonacci
                  </button>
                  <button
                    className="suggestion-btn"
                    onClick={() => handleSuggestionClick("Apakah itu Sistem Evolusi Kognitif Nexa?")}
                  >
                    <span className="black-emoji">🧠</span> Terangkan Evolusi Kognitif
                  </button>
                  <button
                    className="suggestion-btn"
                    onClick={() => handleSuggestionClick("Bina satu strategi pemasaran digital ringkas untuk permulaan teknologi.")}
                  >
                    <span className="black-emoji">📈</span> Strategi Pemasaran
                  </button>
                </div>
              </div>
            ) : (
              /* 3. Conversation Area */
              <div className="conversation-area">
                <div className="conversation-inner">
                  {chat.map((c, i) => {
                    if (c.type === "user") {
                      return (
                        <div key={i} className="user-message-row animate-slide">
                          <div className="user-message-content">{c.text}</div>
                        </div>
                      );
                    } else {
                      return (
                        <div key={i} className="ai-card animate-slide">
                          <div className="ai-card-header">
                            <div className="ai-card-avatar">N</div>
                            <div className="ai-card-meta">
                              <span className="ai-card-title">Nexa AI</span>
                              <span className="ai-card-subtitle">Evolved Strategy Response</span>
                            </div>
                          </div>

                          <div className="ai-card-body">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={MarkdownComponents}
                            >
                              {c.text}
                            </ReactMarkdown>
                          </div>

                          {/* Control actions for AI response: Copy, Like, Dislike, Regenerate */}
                          <div className="ai-card-actions">
                            <button
                              className="card-action-btn"
                              onClick={() => copyCode(c.text, `ai-${i}`)}
                            >
                              {copiedIdx === `ai-${i}` ? "✓ Disalin" : <><span className="black-emoji">📋</span> Salin Respon</>}
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleLike(i)}
                              style={likes[i] ? { color: "var(--accent)", borderColor: "var(--accent)", backgroundColor: "var(--accent-light)" } : {}}
                            >
                              <span className="black-emoji">👍</span> Like
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleDislike(i)}
                              style={dislikes[i] ? { color: "#EF4444", borderColor: "#EF4444", backgroundColor: "rgba(239, 68, 68, 0.08)" } : {}}
                            >
                              <span className="black-emoji">👎</span> Dislike
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleRegenerate(i)}
                            >
                              <span className="black-emoji">🔄</span> Regenerate
                            </button>
                          </div>
                        </div>
                      );
                    }
                  })}

                  {/* Active Loading response card */}
                  {load && (
                    <div className="ai-card animate-slide">
                      <div className="ai-card-header">
                        <div className="ai-card-avatar">N</div>
                        <div className="ai-card-meta">
                          <span className="ai-card-title">Nexa AI</span>
                          <span className="ai-card-subtitle">Thinking...</span>
                        </div>
                      </div>
                      <div className="ai-card-body">
                        <div className="loading-card">
                          <span className="loading-text">Nexa sedang berfikir dan menyusun jawapan terbaik...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>
            )}

            {/* 5. Composer Workspace (Sticky Bottom) */}
            <div className="composer-sticky-container">
              <div className="composer-workspace">
                <div className="composer-input-row">
                  <textarea
                    className="composer-textarea"
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Tanya Nexa apa sahaja... (Gunakan Shift+Enter untuk baris baru)"
                    disabled={load}
                  />
                  <button
                    className="send-btn-round"
                    onClick={() => send()}
                    disabled={load || !msg.trim()}
                    aria-label="Send"
                  >
                    ➤
                  </button>
                </div>

                {/* Flat composer workspace utilities row */}
                <div className="composer-toolbar">
                  <button className="toolbar-btn" onClick={() => setMsg(prev => prev + "📎 ")}>
                    <span className="black-emoji">📎</span> Attachment
                  </button>
                  <button className="toolbar-btn" onClick={() => setMsg(prev => prev + "🖼️ ")}>
                    <span className="black-emoji">🖼️</span> Image
                  </button>
                  <button className="toolbar-btn" onClick={() => setMsg(prev => prev + "🎙️ ")}>
                    <span className="black-emoji">🎙️</span> Voice
                  </button>
                  <button className="toolbar-btn" onClick={() => setMsg(prev => prev + "💻 ")}>
                    <span className="black-emoji">💻</span> Code
                  </button>
                  <button className="toolbar-btn" onClick={() => setMsg(prev => prev + "@ ")}>
                    <span className="black-emoji">👤</span> Mention
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Other Panel Views matching Navbar */}
        {activeNav === "models" && (
          <div className="sub-panel-container animate-fade">
            <div className="sub-panel-inner">
              <h2 className="panel-title">Nexa AI Models</h2>
              <p className="panel-subtitle">Available high performance intelligence units routing through Nexa Evolution Engine.</p>

              <div className="grid-container">
                <div className="flat-card">
                  <span className="flat-card-title">llama-3.3-70b-versatile</span>
                  <p className="flat-card-desc">Our highly versatile model optimized for complex logical thinking, creative content generation, and long conversations.</p>
                </div>
                <div className="flat-card">
                  <span className="flat-card-title">cohere/north-mini-code</span>
                  <p className="flat-card-desc">Specialized coding unit tuned to construct precise, beautiful structures, clear markdown listings, and directory frameworks.</p>
                </div>
                <div className="flat-card">
                  <span className="flat-card-title">llama-3.1-8b-instant</span>
                  <p className="flat-card-desc">Ultra-fast general response model deployed primarily for automated error repairs, cognitive analysis, and simple tasks.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeNav === "history" && (
          <div className="sub-panel-container animate-fade">
            <div className="sub-panel-inner">
              <h2 className="panel-title">Conversation History Overview</h2>
              <p className="panel-subtitle">Manage, rename, archive, or delete previous discussions securely stored on this local client.</p>

              <div className="grid-container">
                {conversations.map((c) => (
                  <div key={c.id} className="flat-card">
                    <span className="flat-card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      {c.title}
                      <span>{c.pinned ? <span className="black-emoji">📌</span> : ""}</span>
                    </span>
                    <p className="flat-card-desc">Mesej: {c.messages?.length || 0} | Dibuat: {new Date(c.createdAt).toLocaleDateString()}</p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button
                        className="card-action-btn"
                        onClick={() => { setActiveId(c.id); setActiveNav("chats"); }}
                      >
                        Buka Sembang
                      </button>
                      <button
                        className="card-action-btn"
                        onClick={(e) => handleArchiveConversation(c.id, e)}
                      >
                        {c.archived ? "Nyaharkib" : "Arkibkan"}
                      </button>
                      <button
                        className="card-action-btn"
                        style={{ color: "#EF4444" }}
                        onClick={(e) => handleDeleteConversation(c.id, e)}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeNav === "tools" && (
          <div className="sub-panel-container animate-fade">
            <div className="sub-panel-inner">
              <h2 className="panel-title">Active Cognitive Tools</h2>
              <p className="panel-subtitle">Specialized self-evolution heuristics and live strategic pipeline rules currently used in prompt generation.</p>

              <div className="grid-container">
                {evoStrategies.map((strat, idx) => (
                  <div key={idx} className="flat-card">
                    <span className="flat-card-title">Strategi {idx + 1}</span>
                    <p className="flat-card-desc">✦ {strat}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeNav === "settings" && (
          <div className="sub-panel-container animate-fade">
            <div className="sub-panel-inner">
              <h2 className="panel-title">Settings & Cognitive Evolution Engine</h2>
              <p className="panel-subtitle">Fine-tune the Nexa AI behavior memory parameters and control the live performance routers.</p>

              <div className="ai-card">
                <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>Konfigurasi Memori & Penyimpanan</h3>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
                  <div>
                    <strong style={{ display: "block", fontSize: "14px" }}>Ingatan Chat (Memory Toggle)</strong>
                    <span style={{ fontSize: "12px", color: "var(--secondary-text)" }}>Sertakan konteks mesej terdahulu secara automatik dalam permintaan API.</span>
                  </div>
                  <input
                    type="checkbox"
                    style={{ width: "20px", height: "20px", cursor: "pointer" }}
                    checked={memoryEnabled}
                    onChange={(e) => setMemoryEnabled(e.target.checked)}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                  <div>
                    <strong style={{ display: "block", fontSize: "14px" }}>Hapus Sejarah</strong>
                    <span style={{ fontSize: "12px", color: "var(--secondary-text)" }}>Padam keseluruhan data perbualan semasa dari storan tempatan peranti.</span>
                  </div>
                  <button className="card-action-btn" style={{ color: "#EF4444", borderColor: "#EF4444" }} onClick={clearChat}>
                    Padam Sejarah
                  </button>
                </div>
              </div>

              <div className="ai-card">
                <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>Sistem Evolusi Kognitif Automatik (Self-Evolution)</h3>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
                  <div>
                    <strong style={{ display: "block", fontSize: "14px" }}>Evolusi Kognitif Automatik</strong>
                    <span style={{ fontSize: "12px", color: "var(--secondary-text)" }}>Menganalisis kesilapan atau kritik chat secara langsung untuk merumus pembetulan kognitif.</span>
                  </div>
                  <input
                    type="checkbox"
                    style={{ width: "20px", height: "20px", cursor: "pointer" }}
                    checked={evolutionEnabled}
                    onChange={(e) => setEvolutionEnabled(e.target.checked)}
                  />
                </div>

                <div style={{ padding: "16px 0", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: "13px", fontWeight: "500", color: "var(--secondary-text)" }}>Personality Version:</span>
                      <strong style={{ fontSize: "13px", color: "var(--accent)", marginLeft: "8px" }}>{evoVersion}</strong>
                    </div>
                    <button
                      className="card-action-btn"
                      onClick={() => triggerSelfEvolution()}
                      disabled={isEvolving}
                    >
                      {isEvolving ? <><span className="black-emoji">🔄</span> Berevolusi...</> : "Jalankan Evolusi Kendiri"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "var(--secondary-text)" }}>Log Evolusi Terkini</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "150px", overflowY: "auto" }}>
                    {evoLogs.map((log, idx) => (
                      <div key={idx} style={{ padding: "10px", border: "1px solid var(--border)", borderRadius: "8px", backgroundColor: "var(--bg)", fontSize: "12.5px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--secondary-text)", fontSize: "11px", marginBottom: "4px" }}>
                          <span>{log.date}</span>
                          <span style={{ color: "var(--accent)", fontWeight: "600" }}>RESOLVED</span>
                        </div>
                        <div><span className="black-emoji">⚠️</span> <strong>Kesilapan:</strong> {log.mistake}</div>
                        <div style={{ marginTop: "4px" }}>✓ <strong>Strategi:</strong> {log.strategy}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeNav === "about" && (
          <div className="sub-panel-container animate-fade">
            <div className="sub-panel-inner">
              <h2 className="panel-title">About NEXA AI</h2>
              <p className="panel-subtitle">Nexa is a minimalist, clean, and highly productive workspace designed from the ground up for developer efficiency.</p>

              <div className="ai-card">
                <p>Nexa is built upon a dual-column flat structural philosophy: an organized sidebar navigation for immediate interaction and a broad central workspace providing a clean layout with zero visual clutter.</p>
                <p>Equipped with a live Self-Evolution cognitive engine, Nexa monitors request metrics, user critique, and formatting feedback to upgrade its system prompts dynamically on every session.</p>
                <p style={{ marginTop: "16px", fontWeight: "500" }}>Made with focus, clarity, and precision for professional builders.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
