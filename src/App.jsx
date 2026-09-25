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
  const [loadingStatus, setLoadingStatus] = useState("AXMchat sedang berfikir...");
  const [error, setError] = useState(null);
  const [brainMemoryId, setBrainMemoryId] = useState("");
  const [brainHistory, setBrainHistory] = useState([]);
  const [brainHistoryLoading, setBrainHistoryLoading] = useState(false);
  const [brainHistoryError, setBrainHistoryError] = useState("");
  const [brainRestoringVersion, setBrainRestoringVersion] = useState(null);
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

  const handleShare = async (content, key) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "AXMchat AI Response",
          text: content,
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          copyCode(content, key);
        }
      }
    } else {
      copyCode(content, key);
    }
  };

  const handleShareChat = async () => {
    if (chat.length === 0) return;
    const conversationText = chat.map(m => `${m.type === "user" ? "User" : "AXMchat AI"}: ${m.text}`).join("\n\n");
    if (navigator.share) {
      try {
        await navigator.share({
          title: activeConversation.title || "AXMchat AI Chat",
          text: conversationText,
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          copyCode(conversationText, "top-bar-share");
        }
      }
    } else {
      copyCode(conversationText, "top-bar-share");
    }
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
    setLoadingStatus("AXMchat sedang berfikir...");
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

  async function loadBrainHistory() {
    const memoryId = brainMemoryId.trim();
    if (!memoryId) {
      setBrainHistoryError("Masukkan Memory ID terlebih dahulu.");
      return;
    }
    setBrainHistoryLoading(true);
    setBrainHistoryError("");
    try {
      const res = await fetch(`/api/brain/history?memory_id=${encodeURIComponent(memoryId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal mendapatkan memory history.");
      setBrainHistory(data.history || []);
    } catch (err) {
      setBrainHistory([]);
      setBrainHistoryError(err.message || "Gagal mendapatkan memory history.");
    } finally {
      setBrainHistoryLoading(false);
    }
  }

  async function restoreBrainVersion(version) {
    if (!brainMemoryId.trim()) return;
    if (!window.confirm(`Restore memory ke versi v${version}?`)) return;
    setBrainRestoringVersion(version);
    setBrainHistoryError("");
    try {
      const res = await fetch("/api/brain/history/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memory_id: brainMemoryId.trim(), version })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Restore gagal.");
      await loadBrainHistory();
    } catch (err) {
      setBrainHistoryError(err.message || "Restore gagal.");
    } finally {
      setBrainRestoringVersion(null);
    }
  }

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
         SIDEBAR (LEFT) - Modern Glass Sidebar with Icons
         ========================================================================== */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">A</div>
            <div className="logo-text">AXMchat</div>
          </div>
          <button className="new-chat-btn" onClick={handleNewChat}>
            <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>New Chat</span>
          </button>
        </div>

        {/* Sidebar Menu Options */}
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeNav === "chats" ? "active" : ""}`}
            onClick={() => { setActiveNav("chats"); setSidebarOpen(false); }}
          >
            <span className="nav-icon">
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </span>
            <span>Chats</span>
          </button>
          <button
            className={`nav-item ${activeNav === "models" ? "active" : ""}`}
            onClick={() => { setActiveNav("models"); setSidebarOpen(false); }}
          >
            <span className="nav-icon">
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </span>
            <span>Models</span>
          </button>
          <button
            className={`nav-item ${activeNav === "brain" ? "active" : ""}`}
            onClick={() => { setActiveNav("brain"); setSidebarOpen(false); }}
          >
            <span className="nav-icon">
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
                <path d="M9.5 2a3.5 3.5 0 0 0-3.4 4.35A3.5 3.5 0 0 0 4 12a3.5 3.5 0 0 0 2.1 5.65A3.5 3.5 0 0 0 9.5 22c1.1 0 2-.4 2.5-1.1.5.7 1.4 1.1 2.5 1.1a3.5 3.5 0 0 0 3.4-4.35A3.5 3.5 0 0 0 20 12a3.5 3.5 0 0 0-2.1-5.65A3.5 3.5 0 0 0 14.5 2c-1.1 0-2 .4-2.5 1.1C11.5 2.4 10.6 2 9.5 2z"></path>
              </svg>
            </span>
            <span>Brain</span>
          </button>
          <button
            className={`nav-item ${activeNav === "history" ? "active" : ""}`}
            onClick={() => { setActiveNav("history"); setSidebarOpen(false); }}
          >
            <span className="nav-icon">
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </span>
            <span>History</span>
          </button>
          <button
            className={`nav-item ${activeNav === "settings" ? "active" : ""}`}
            onClick={() => { setActiveNav("settings"); setSidebarOpen(false); }}
          >
            <span className="nav-icon">
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </span>
            <span>Settings</span>
          </button>
          <button
            className={`nav-item ${activeNav === "about" ? "active" : ""}`}
            onClick={() => { setActiveNav("about"); setSidebarOpen(false); }}
          >
            <span className="nav-icon">
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            </span>
            <span>About</span>
          </button>

          {/* Sesi Aktif List inside Sidebar for easy access when Chats navigation is active */}
          {activeNav === "chats" && (
            <div className="sidebar-sub-section animate-fade">
              <span className="sidebar-sub-title">Sesi Aktif</span>
              <div className="sidebar-search-box">
                <input
                  type="text"
                  placeholder="Cari perbualan..."
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
                            <svg stroke="currentColor" fill={c.pinned ? "currentColor" : "none"} strokeWidth="2" viewBox="0 0 24 24" height="12" width="12" xmlns="http://www.w3.org/2000/svg">
                              <line x1="12" y1="17" x2="12" y2="22"></line>
                              <path d="M5 17h14l-1.5-6V5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v6L5 17z"></path>
                            </svg>
                          </button>
                          <button
                            className="sidebar-action-btn"
                            onClick={(e) => handleArchiveConversation(c.id, e)}
                            title="Arkib Sembang"
                          >
                            <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="12" width="12" xmlns="http://www.w3.org/2000/svg">
                              <polyline points="21 8 21 21 3 21 3 8"></polyline>
                              <rect x="1" y="3" width="22" height="5"></rect>
                              <line x1="10" y1="12" x2="14" y2="12"></line>
                            </svg>
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
                            <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="12" width="12" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button
                            className="sidebar-action-btn"
                            onClick={(e) => handleDeleteConversation(c.id, e)}
                            title="Padam Sembang"
                          >
                            <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="12" width="12" xmlns="http://www.w3.org/2000/svg">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
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
          <div className="profile-avatar">AX</div>
          <div className="profile-info">
            <span className="profile-name">AXMchat Developer</span>
            <span className="profile-plan">Pro Evolution Plan</span>
          </div>
        </div>

        {/* Version Footer */}
        <div className="sidebar-footer">
          <span>Version 1.2.4</span>
        </div>
      </aside>

      {/* ==========================================================================
         WORKSPACE UTAMA
         ========================================================================== */}
      <div className="workspace">
        {/* 1. Top Bar */}
        <header className="top-bar">
          <div className="top-bar-left">
            <button
              className="mobile-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            <div className="ai-status-container">
              <span className="ai-name">AXMchat</span>
              <div className="status-indicator">
                <span className={`status-dot ${currentStatus === "Thinking" ? "thinking" : ""}`} />
                <span>{currentStatus}</span>
              </div>
            </div>
          </div>

          <div className="top-bar-actions">
            <button
              className="card-action-btn"
              onClick={handleShareChat}
              disabled={chat.length === 0}
            >
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="14" width="14" xmlns="http://www.w3.org/2000/svg">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              <span>{copiedIdx === "top-bar-share" ? "Disalin ✓" : "Share Chat"}</span>
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
                <div className="hero-logo">A</div>
                <h2 className="hero-title">Hello, I'm AXMchat.</h2>
                <p className="hero-tagline">Build. Think. Create.</p>

                <div className="suggestion-prompts-container">
                  <button
                    className="suggestion-btn"
                    onClick={() => handleSuggestionClick("Tulis fungsi Fibonacci dalam Python dan jelaskan prestasinya.")}
                  >
                    <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="14" width="14" xmlns="http://www.w3.org/2000/svg">
                      <polyline points="16 18 22 12 16 6"></polyline>
                      <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    <span>Tulis Kod Fibonacci</span>
                  </button>
                  <button
                    className="suggestion-btn"
                    onClick={() => handleSuggestionClick("Bina satu strategi pemasaran digital ringkas untuk permulaan teknologi.")}
                  >
                    <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="14" width="14" xmlns="http://www.w3.org/2000/svg">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    <span>Strategi Pemasaran</span>
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

                          {/* Control actions for AI response: Copy, Like, Dislike, Regenerate, Share */}
                          <div className="ai-card-actions">
                            <button
                              className="card-action-btn"
                              onClick={() => copyCode(c.text, `ai-${messageId}`)}
                            >
                              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="13" width="13" xmlns="http://www.w3.org/2000/svg">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                              </svg>
                              <span>{copiedIdx === `ai-${messageId}` ? "Disalin" : "Salin Respon"}</span>
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleLike(messageId)}
                              style={c.feedback === "like" ? { color: "var(--accent)", borderColor: "var(--accent)", backgroundColor: "var(--accent-light)" } : {}}
                            >
                              <svg stroke="currentColor" fill={c.feedback === "like" ? "currentColor" : "none"} strokeWidth="2" viewBox="0 0 24 24" height="13" width="13" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                              </svg>
                              <span>Like</span>
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleDislike(messageId)}
                              style={c.feedback === "dislike" ? { color: "#EF4444", borderColor: "#EF4444", backgroundColor: "rgba(239, 68, 68, 0.08)" } : {}}
                            >
                              <svg stroke="currentColor" fill={c.feedback === "dislike" ? "currentColor" : "none"} strokeWidth="2" viewBox="0 0 24 24" height="13" width="13" xmlns="http://www.w3.org/2000/svg">
                                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
                              </svg>
                              <span>Dislike</span>
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleRegenerate(messageId)}
                            >
                              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="13" width="13" xmlns="http://www.w3.org/2000/svg">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                              </svg>
                              <span>Regenerate</span>
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={() => handleShare(c.text, `share-${messageId}`)}
                            >
                              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="13" width="13" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                              </svg>
                              <span>{copiedIdx === `share-${messageId}` ? "Disalin" : "Share"}</span>
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

                  {/* Active Loading response card */}
                  {load && (
                    <div className="ai-card animate-slide">
                      <div className="ai-card-body">
                        <div className="loading-card">
                          <span className="loading-text">
                            <svg className="animate-spin" stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg" style={{ animation: "spinProcess 1.2s linear infinite" }}>
                              <line x1="12" y1="2" x2="12" y2="6"></line>
                              <line x1="12" y1="18" x2="12" y2="22"></line>
                              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                              <line x1="2" y1="12" x2="6" y2="12"></line>
                              <line x1="18" y1="12" x2="22" y2="12"></line>
                              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                            </svg>
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
                <div className="composer-input-row">
                  <textarea
                    className="composer-textarea"
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Tanya AXMchat apa sahaja... (Shift+Enter untuk baris baru)"
                    disabled={load}
                  />
                  <button
                    className="send-btn-round"
                    onClick={() => send()}
                    disabled={load || !msg.trim()}
                    aria-label="Send"
                  >
                    <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
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
              <h2 className="panel-title">AXMchat AI Models</h2>
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

        {activeNav === "brain" && (
          <div className="sub-panel-container animate-fade">
            <div className="sub-panel-inner">
              <h2 className="panel-title">AXMchat Brain</h2>
              <p className="panel-subtitle">Memory History & Versioning — lihat perubahan memory dan restore versi lama.</p>

              <div className="flat-card brain-history-search-card">
                <label className="flat-card-title" htmlFor="brain-memory-id">Memory ID</label>
                <div className="brain-history-input-row">
                  <input id="brain-memory-id" value={brainMemoryId} onChange={(e) => setBrainMemoryId(e.target.value)} placeholder="Contoh: mem_a1b2c3d4e5f6" />
                  <button className="card-action-btn brain-primary-btn" onClick={loadBrainHistory} disabled={brainHistoryLoading}>
                    {brainHistoryLoading ? "Memuat..." : "Lihat History"}
                  </button>
                </div>
                <span className="flat-card-desc">Buat masa ini UI menggunakan knowledge scope. User/project/session scope akan disambungkan selepas layer permissions siap.</span>
              </div>

              {brainHistoryError && <div className="error-banner brain-history-error">{brainHistoryError}</div>}

              {brainHistory.length > 0 ? (
                <div className="brain-history-list">
                  {[...brainHistory].reverse().map((item) => (
                    <div className="flat-card brain-history-item" key={item.version}>
                      <div className="brain-history-item-top">
                        <div>
                          <div className="flat-card-title">v{item.version} <span className="brain-operation">{item.operation}</span></div>
                          <div className="flat-card-desc">{item.snapshotCreatedAt ? new Date(item.snapshotCreatedAt).toLocaleString() : "Tarikh tidak tersedia"}</div>
                        </div>
                        <button className="card-action-btn" onClick={() => restoreBrainVersion(item.version)} disabled={brainRestoringVersion !== null}>
                          {brainRestoringVersion === item.version ? "Restoring..." : "Restore"}
                        </button>
                      </div>
                      <div className="brain-history-meta">
                        {item.previousVersion ? `Previous: v${item.previousVersion}` : "Initial snapshot"}
                        {item.restoredFromVersion ? ` · Restored from: v${item.restoredFromVersion}` : ""}
                        {item.contentHash ? ` · Hash: ${item.contentHash.slice(0, 10)}…` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !brainHistoryLoading && <div className="flat-card brain-empty-state">Tiada history ditemui untuk Memory ID ini.</div>
              )}
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
              <p className="panel-subtitle">Konfigurasi tetapan ingatan dan persekitaran AXMchat AI.</p>

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
              <h2 className="panel-title">About AXMchat AI</h2>
              <p className="panel-subtitle">AXMchat is a minimalist, clean, and highly productive workspace designed from the ground up for developer efficiency.</p>

              <div className="flat-card">
                <p style={{ lineHeight: "1.6", color: "var(--primary-text)" }}>
                  AXMchat is built upon a dual-column flat structural philosophy: an organized sidebar navigation for immediate interaction and a broad central workspace providing a clean layout with zero visual clutter.
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
