import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

function App() {
  const [msg, setMsg] = useState("");

  // Navigation State: 'chats' | 'models' | 'history' | 'settings' | 'about'
  const [activeNav, setActiveNav] = useState("chats");

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

  const [generalModel, setGeneralModel] = useState(() => {
    try {
      const saved = localStorage.getItem("nexa_general_model");
      return saved ? saved : "qwen/qwen3-235b-a22b-2507";
    } catch {
      return "qwen/qwen3-235b-a22b-2507";
    }
  });

  const [codingModel, setCodingModel] = useState(() => {
    try {
      const saved = localStorage.getItem("nexa_coding_model");
      return saved ? saved : "openrouter/free";
    } catch {
      return "openrouter/free";
    }
  });

  const [fallbackModel, setFallbackModel] = useState(() => {
    try {
      const saved = localStorage.getItem("nexa_fallback_model");
      return saved ? saved : "openrouter/free";
    } catch {
      return "openrouter/free";
    }
  });

  const [load, setLoad] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Nexa sedang berfikir...");
  const [error, setError] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const chatEndRef = useRef(null);

  // Feedback popup state based on message ID
  const [dislikeReasonMsgId, setDislikeReasonMsgId] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

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
      localStorage.setItem("nexa_general_model", generalModel);
    } catch (err) {
      console.error(err);
    }
  }, [generalModel]);

  useEffect(() => {
    try {
      localStorage.setItem("nexa_coding_model", codingModel);
    } catch (err) {
      console.error(err);
    }
  }, [codingModel]);

  useEffect(() => {
    try {
      localStorage.setItem("nexa_fallback_model", fallbackModel);
    } catch (err) {
      console.error(err);
    }
  }, [fallbackModel]);

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

  const handleSuggestionClick = (promptText) => {
    setMsg(promptText);
  };

  const getUserMessageBeforeId = (msgId) => {
    const idx = chat.findIndex(m => m.id === msgId);
    if (idx === -1) return "";
    for (let k = idx - 1; k >= 0; k--) {
      if (chat[k].type === "user") {
        return chat[k].text;
      }
    }
    return "";
  };

  const sendFeedbackToBackend = async (msgId, type, reason = "") => {
    try {
      const userMessageText = getUserMessageBeforeId(msgId);
      const targetMsg = chat.find(m => m.id === msgId);
      const aiResponseText = targetMsg?.text || "";
      const isCode = userMessageText.toLowerCase().includes("kod") || userMessageText.toLowerCase().includes("code") || aiResponseText.includes("```");
      const model = isCode ? codingModel : generalModel;

      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeId,
          message_id: msgId,
          user_message: userMessageText,
          ai_response: aiResponseText,
          provider: "openrouter",
          model: model,
          type: type,
          reason: reason
        })
      });
    } catch (err) {
      console.error("Gagal menghantar maklum balas:", err);
    }
  };

  const updateMessageFeedback = (msgId, type, reason = "") => {
    setConversations(prevConvs => {
      return prevConvs.map(conv => {
        if (conv.id === activeId) {
          const updatedMessages = conv.messages.map(m => {
            if (m.id === msgId || (m.id === undefined && msgId.startsWith("msg_legacy_"))) {
              return { ...m, feedback: type, feedbackReason: reason };
            }
            return m;
          });
          return { ...conv, messages: updatedMessages };
        }
        return conv;
      });
    });
  };

  const handleLike = (msgId) => {
    const targetMsg = chat.find(m => m.id === msgId);
    const isCurrentlyLiked = targetMsg?.feedback === "like";
    const nextFeedback = isCurrentlyLiked ? null : "like";

    updateMessageFeedback(msgId, nextFeedback);
    setDislikeReasonMsgId(null);

    if (nextFeedback === "like") {
      sendFeedbackToBackend(msgId, "positive");
    }
  };

  const handleDislike = (msgId) => {
    const targetMsg = chat.find(m => m.id === msgId);
    const isCurrentlyDisliked = targetMsg?.feedback === "dislike";
    const nextFeedback = isCurrentlyDisliked ? null : "dislike";

    updateMessageFeedback(msgId, nextFeedback);

    if (nextFeedback === "dislike") {
      setDislikeReasonMsgId(msgId);
      sendFeedbackToBackend(msgId, "negative");
    } else {
      setDislikeReasonMsgId(null);
    }
  };

  const handleSelectReason = (msgId, option) => {
    updateMessageFeedback(msgId, "dislike", option);
    sendFeedbackToBackend(msgId, "negative", option);
    setDislikeReasonMsgId(null);
  };

  const handleRegenerate = async (msgId) => {
    const msgIdx = chat.findIndex(m => m.id === msgId);
    if (msgIdx === -1) return;

    const lastUserMsgIdx = chat.slice(0, msgIdx).reduce((lastIdx, m, i) => m.type === "user" ? i : lastIdx, -1);
    if (lastUserMsgIdx !== -1) {
      const userText = chat[lastUserMsgIdx].text;
      const historyToKeep = chat.slice(0, lastUserMsgIdx);
      updateActiveMessages([...historyToKeep, { id: chat[lastUserMsgIdx].id, type: "user", text: userText }]);
      setTimeout(() => {
        send(userText, historyToKeep);
      }, 50);
    }
  };

  // Main Send Function
  async function send(overrideMsg, overrideHistory) {
    const textToSend = overrideMsg || msg;
    if (!textToSend.trim() || load) return;

    if (!generalModel.trim() || !codingModel.trim() || !fallbackModel.trim()) {
      setError("Model ID untuk General AI, Coding AI, dan Fallback AI tidak boleh kosong.");
      return;
    }

    const historyForRequest = memoryEnabled
      ? (overrideHistory || chat).map((m) => ({
          role: m.type === "user" ? "user" : "assistant",
          content: m.text || "",
        }))
      : [];

    if (!overrideMsg) {
      const userMsgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      updateActiveMessages((prev) => [...prev, { id: userMsgId, type: "user", text: textToSend }]);
      setMsg("");
    }

    setLoad(true);
    setLoadingStatus("Nexa sedang berfikir...");
    setError(null);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: textToSend,
          history: historyForRequest,
          generalModel: generalModel.trim(),
          codingModel: codingModel.trim(),
          fallbackModel: fallbackModel.trim()
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Server balas status ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalAnswer = null;
      let serverError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const data = JSON.parse(part.slice(6));

          if (data.type === "process_step") {
            if (data.label) setLoadingStatus(data.label);
          } else if (data.type === "status") {
            if (data.text) setLoadingStatus(data.text);
          } else if (data.type === "answer") {
            finalAnswer = data.text;
          } else if (data.type === "error") {
            serverError = data.text;
          }
        }
      }

      if (serverError) throw new Error(serverError);
      if (finalAnswer === null) throw new Error("Tiada jawapan diterima.");

      const aiMsgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      updateActiveMessages(prev => [
        ...prev,
        { id: aiMsgId, type: "ai", text: finalAnswer, feedback: null, feedbackReason: "" }
      ]);
    } catch (err) {
      setError(err.message || "Gagal hubungi server. Cuba refresh.");
      const errMsgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      updateActiveMessages((prev) => [
        ...prev,
        { id: errMsgId, type: "ai", text: "Maaf, saya tak dapat balas sekarang: " + (err.message || "Gagal hubungi server."), feedback: null, feedbackReason: "" }
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

  function fallbackCopy(content, key) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedIdx(key);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch (err) {
      console.error("Gagal menyalin kod:", err);
      setCopiedIdx(key);
      setTimeout(() => setCopiedIdx(null), 1500);
    }
  }

  function copyCode(content, key) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(content)
        .then(() => {
          setCopiedIdx(key);
          setTimeout(() => setCopiedIdx(null), 1500);
        })
        .catch(() => {
          fallbackCopy(content, key);
        });
    } else {
      fallbackCopy(content, key);
    }
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
              {copiedIdx === key ? (
                <>
                  <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="copy-btn-icon" height="14" width="14" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>Disalin!</span>
                </>
              ) : (
                <>
                  <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="copy-btn-icon" height="14" width="14" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  </svg>
                  <span>Salin kod</span>
                </>
              )}
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
    const matchesContent = c.messages.some(m => (m.text || "").toLowerCase().includes(searchQuery.toLowerCase()));
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
         SIDEBAR (LEFT) - 260px Fixed Layout (NO EMOJIS)
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
            Chats
          </button>
          <button
            className={`nav-item ${activeNav === "models" ? "active" : ""}`}
            onClick={() => { setActiveNav("models"); setSidebarOpen(false); }}
          >
            Models
          </button>
          <button
            className={`nav-item ${activeNav === "history" ? "active" : ""}`}
            onClick={() => { setActiveNav("history"); setSidebarOpen(false); }}
          >
            History
          </button>
          <button
            className={`nav-item ${activeNav === "settings" ? "active" : ""}`}
            onClick={() => { setActiveNav("settings"); setSidebarOpen(false); }}
          >
            Settings
          </button>
          <button
            className={`nav-item ${activeNav === "about" ? "active" : ""}`}
            onClick={() => { setActiveNav("about"); setSidebarOpen(false); }}
          >
            About
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
                            {c.pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            className="sidebar-action-btn"
                            onClick={(e) => handleArchiveConversation(c.id, e)}
                            title="Arkib Sembang"
                          >
                            Arkib
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
                            Edit
                          </button>
                          <button
                            className="sidebar-action-btn"
                            onClick={(e) => handleDeleteConversation(c.id, e)}
                            title="Padam Sembang"
                          >
                            Padam
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
          <div className="top-bar-left">
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
                    Tulis Kod Fibonacci
                  </button>
                  <button
                    className="suggestion-btn"
                    onClick={() => handleSuggestionClick("Bina satu strategi pemasaran digital ringkas untuk permulaan teknologi.")}
                  >
                    Strategi Pemasaran
                  </button>
                </div>
              </div>
            ) : (
              /* 3. Conversation Area */
              <div className="conversation-area">
                <div className="conversation-inner">
                  {chat.map((c, i) => {
                    const messageId = c.id || `msg_legacy_${i}`;
                    if (c.type === "user") {
                      return (
                        <div key={messageId} className="user-message-row animate-slide">
                          <div className="user-message-content">{c.text}</div>
                        </div>
                      );
                    } else {
                      // RENDER REGULAR CHAT AI CARD
                      if (!c.text) return null;

                      return (
                        <div key={messageId} className="ai-card animate-slide">
                          <div className="ai-card-body">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={MarkdownComponents}
                            >
                              {c.text}
                            </ReactMarkdown>
                          </div>

                          {/* Control actions for AI response: Copy, Like, Dislike, Regenerate (Toolbar only when response exists) */}
                          <div className="ai-card-actions">
                            <button
                              className="card-action-btn"
                              onClick={() => copyCode(c.text, `ai-${messageId}`)}
                            >
                              {copiedIdx === `ai-${messageId}` ? "Disalin" : "Salin Respon"}
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleLike(messageId)}
                              style={c.feedback === "like" ? { color: "var(--accent)", borderColor: "var(--accent)", backgroundColor: "var(--accent-light)" } : {}}
                            >
                              Like
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleDislike(messageId)}
                              style={c.feedback === "dislike" ? { color: "#EF4444", borderColor: "#EF4444", backgroundColor: "rgba(239, 68, 68, 0.08)" } : {}}
                            >
                              Dislike
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleRegenerate(messageId)}
                            >
                              Regenerate
                            </button>
                          </div>

                          {/* Dislike reason picker */}
                          {c.feedback === "dislike" && dislikeReasonMsgId === messageId && (
                            <div className="dislike-reason-popup animate-slide">
                              <span className="reason-title">Sila pilih alasan (pilihan):</span>
                              <div className="reason-options">
                                {["Wrong", "Incomplete", "Didn't follow instruction", "Bad code", "Other"].map(opt => (
                                  <button
                                    key={opt}
                                    className="reason-opt-btn"
                                    onClick={() => handleSelectReason(messageId, opt)}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                              <button className="reason-close-btn" onClick={() => setDislikeReasonMsgId(null)}>
                                Tutup
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }
                  })}

                  {/* Active Loading response card using single existing loading container */}
                  {load && (
                    <div className="ai-card animate-slide">
                      <div className="ai-card-body">
                        <div className="loading-card">
                          <span className="loading-text">
                            {loadingStatus}
                          </span>
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
                <textarea
                  className="composer-textarea"
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tanya Nexa apa sahaja... (Shift+Enter untuk baris baru)"
                  disabled={load}
                />

                <div className="composer-bottom-row">
                  <button
                    className="send-btn-round"
                    onClick={() => send()}
                    disabled={load || !msg.trim()}
                    aria-label="Send"
                  >
                    ➤
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
              <p className="panel-subtitle">Tetapkan Model ID tersuai untuk General AI, Coding AI, dan Fallback AI.</p>

              <div className="grid-container">
                <div className="flat-card">
                  <span className="flat-card-title">General AI</span>
                  <p className="flat-card-desc" style={{ marginBottom: "12px" }}>Model utama untuk tugasan am / sembang biasa.</p>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--secondary-text)", marginBottom: "6px" }}>General AI Model ID</label>
                  <input
                    type="text"
                    value={generalModel}
                    onChange={(e) => setGeneralModel(e.target.value)}
                    placeholder="Contoh: qwen/qwen3-235b-a22b-2507"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      color: "inherit",
                      fontSize: "14px",
                      outline: "none"
                    }}
                  />
                </div>
                <div className="flat-card">
                  <span className="flat-card-title">Coding AI</span>
                  <p className="flat-card-desc" style={{ marginBottom: "12px" }}>Model utama untuk tugasan pengkodan.</p>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--secondary-text)", marginBottom: "6px" }}>Code AI Model ID</label>
                  <input
                    type="text"
                    value={codingModel}
                    onChange={(e) => setCodingModel(e.target.value)}
                    placeholder="Contoh: openrouter/free"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      color: "inherit",
                      fontSize: "14px",
                      outline: "none"
                    }}
                  />
                </div>
                <div className="flat-card">
                  <span className="flat-card-title">Fallback AI</span>
                  <p className="flat-card-desc" style={{ marginBottom: "12px" }}>Model cadangan automatik jika model utama mengalami ralat sementara (429 rate limit/server error).</p>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--secondary-text)", marginBottom: "6px" }}>Fallback Model ID</label>
                  <input
                    type="text"
                    value={fallbackModel}
                    onChange={(e) => setFallbackModel(e.target.value)}
                    placeholder="Contoh: openrouter/free"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      color: "inherit",
                      fontSize: "14px",
                      outline: "none"
                    }}
                  />
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
                      <span>{c.pinned ? "Pinned" : ""}</span>
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

        {activeNav === "settings" && (
          <div className="sub-panel-container animate-fade">
            <div className="sub-panel-inner">
              <h2 className="panel-title">Settings</h2>
              <p className="panel-subtitle">Konfigurasi tetapan ingatan dan persekitaran Nexa AI.</p>

              <div className="flat-card">
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

            </div>
          </div>
        )}

        {activeNav === "about" && (
          <div className="sub-panel-container animate-fade">
            <div className="sub-panel-inner">
              <h2 className="panel-title">About NEXA AI</h2>
              <p className="panel-subtitle">Nexa is a minimalist, clean, and highly productive workspace designed from the ground up for developer efficiency.</p>

              <div className="flat-card">
                <p style={{ lineHeight: "1.6", color: "var(--primary-text)" }}>
                  Nexa is built upon a dual-column flat structural philosophy: an organized sidebar navigation for immediate interaction and a broad central workspace providing a clean layout with zero visual clutter.
                </p>
                <p style={{ marginTop: "16px", fontWeight: "500", color: "var(--secondary-text)" }}>
                  Made with focus, clarity, and precision for professional builders.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
