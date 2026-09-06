import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

function App() {
  const [msg, setMsg] = useState("");

  // Navigation State: 'chats' | 'agent' | 'models' | 'history' | 'settings' | 'about'
  const [activeNav, setActiveNav] = useState("chats");

  // Agent Mode State
  const [agentTaskInput, setAgentTaskInput] = useState("");
  const [agentTaskId, setAgentTaskId] = useState(null);
  const [agentStatus, setAgentStatus] = useState("idle"); // 'idle' | 'pending' | 'preparing' | 'running' | 'completed' | 'failed' | 'stopped'
  const [agentApprovalStatus, setAgentApprovalStatus] = useState("pending"); // 'pending' | 'approved' | 'rejected'
  const [agentFeed, setAgentFeed] = useState([]);
  const [agentResult, setAgentResult] = useState("");
  const [agentError, setAgentError] = useState("");
  const [agentDiffData, setAgentDiffData] = useState(null);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushStatusMsg, setPushStatusMsg] = useState(null);
  const [pushErrorMsg, setPushErrorMsg] = useState(null);

  // GitHub Repos & Branches State
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [reposLoading, setReposLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);

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

  // Fetch Repositories on Agent Mode or Mount
  useEffect(() => {
    if (activeNav === "agent" && repos.length === 0 && !reposLoading) {
      setReposLoading(true);
      fetch("/api/github/repos")
        .then(res => res.json())
        .then(data => {
          if (data.connected && Array.isArray(data.repos)) {
            setRepos(data.repos);
            if (data.repos.length > 0) {
              const defaultRepo = data.repos[0].full_name;
              setSelectedRepo(defaultRepo);
            }
          }
        })
        .catch(err => console.error("Gagal memuatkan repositori GitHub:", err))
        .finally(() => setReposLoading(false));
    }
  }, [activeNav, repos.length, reposLoading]);

  // Fetch Branches when Selected Repository changes
  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      setSelectedBranch("");
      return;
    }

    const [owner, repo] = selectedRepo.split("/");
    if (!owner || !repo) return;

    setBranchesLoading(true);
    fetch(`/api/github/repos/${owner}/${repo}/branches`)
      .then(res => res.json())
      .then(data => {
        if (data.connected && Array.isArray(data.branches)) {
          setBranches(data.branches);
          if (data.branches.length > 0) {
            setSelectedBranch(data.branches[0].name);
          }
        }
      })
      .catch(err => console.error("Gagal memuatkan branch GitHub:", err))
      .finally(() => setBranchesLoading(false));
  }, [selectedRepo]);

  // Agent Task Status Polling Effect
  useEffect(() => {
    if (!agentTaskId || (agentStatus !== "pending" && agentStatus !== "running")) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/agent/task/${agentTaskId}`);
        if (!res.ok) return;

        const data = await res.json();
        const newStatus = data.status || "pending";
        setAgentStatus(newStatus);

        setAgentFeed(prev => {
          const feedSet = new Set(prev);
          if (newStatus === "preparing") {
            feedSet.add("● Preparing repository sandbox");
          } else if (newStatus === "running") {
            feedSet.add("● Preparing repository sandbox");
            feedSet.add("● Hermes Agent running");
          } else if (newStatus === "completed") {
            feedSet.add("● Preparing repository sandbox");
            feedSet.add("● Hermes Agent running");
            feedSet.add("✓ Agent completed");
          } else if (newStatus === "failed") {
            feedSet.add("● Preparing repository sandbox");
            feedSet.add("● Hermes Agent running");
            feedSet.add("✖ Task failed");
          }
          return Array.from(feedSet);
        });

        if (newStatus === "completed") {
          setAgentResult(data.result || "Task completed successfully.");
          if (data.approval_status) {
            setAgentApprovalStatus(data.approval_status);
          }
          // Fetch diff data on completion
          fetch(`/api/agent/task/${agentTaskId}/diff`)
            .then(dRes => dRes.json())
            .then(dData => {
              if (dData && dData.status === "completed") {
                setAgentDiffData(dData);
                if (dData.approval_status) setAgentApprovalStatus(dData.approval_status);
              }
            })
            .catch(err => console.error("Gagal memuatkan diff tugasan:", err));
        } else if (newStatus === "failed") {
          setAgentError(data.error || "Task failed with an error.");
        }
      } catch (err) {
        console.error("Gagal menyemak status ejen:", err);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [agentTaskId, agentStatus]);

  const handlePushChanges = async () => {
    if (!agentTaskId || !commitMessage.trim() || pushLoading) return;

    setPushLoading(true);
    setPushErrorMsg(null);
    setPushStatusMsg("Memulakan operasi commit & push...");

    try {
      const res = await fetch(`/api/agent/task/${agentTaskId}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commit_message: commitMessage.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Operasi push gagal.");
      }

      setPushStatusMsg(`Berjaya push commit ${data.commit} ke ${data.repository}:${data.branch}`);
      setTimeout(() => {
        setShowPushModal(false);
        setCommitMessage("");
      }, 2000);
    } catch (err) {
      setPushErrorMsg(err.message || "Gagal melaksanakan push.");
    } finally {
      setPushLoading(false);
    }
  };

  const handleApprovalAction = async (action) => {
    if (!agentTaskId) return;

    try {
      const res = await fetch(`/api/agent/task/${agentTaskId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });

      const data = await res.json();
      if (res.ok && data.approval_status) {
        setAgentApprovalStatus(data.approval_status);
      }
    } catch (err) {
      console.error("Gagal mengemaskini kelulusan:", err);
    }
  };

  const handleRunAgent = async () => {
    if (!agentTaskInput.trim() || !selectedRepo || !selectedBranch || agentStatus === "pending" || agentStatus === "preparing" || agentStatus === "running") return;

    setAgentStatus("pending");
    setAgentApprovalStatus("pending");
    setAgentFeed(["✓ Task accepted", "✓ Workspace created"]);
    setAgentResult("");
    setAgentError("");
    setAgentDiffData(null);
    setShowDiffViewer(false);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: agentTaskInput.trim(),
          session_id: activeId || "session_default",
          repository: selectedRepo,
          branch: selectedBranch
        })
      });

      const data = await res.json();
      if (!res.ok || data.status === "error") {
        throw new Error(data.message || "Gagal memulakan tugasan ejen.");
      }

      setAgentTaskId(data.task_id);
    } catch (err) {
      setAgentStatus("failed");
      setAgentError(err.message || "Gagal berhubung dengan Hermes Agent.");
      setAgentFeed(prev => [...prev, "✖ Task initialization failed"]);
    }
  };

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
          title: "Nexa AI Response",
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
    const conversationText = chat.map(m => `${m.type === "user" ? "User" : "Nexa AI"}: ${m.text}`).join("\n\n");
    if (navigator.share) {
      try {
        await navigator.share({
          title: activeConversation.title || "Nexa AI Chat",
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
            className={`nav-item ${activeNav === "agent" ? "active" : ""}`}
            onClick={() => { setActiveNav("agent"); setSidebarOpen(false); }}
          >
            Agent Engine
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

          <div className="top-bar-actions">
            <button
              className="card-action-btn"
              onClick={handleShareChat}
              disabled={chat.length === 0}
            >
              {copiedIdx === "top-bar-share" ? "Disalin ✓" : "Share Chat"}
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

                          {/* Control actions for AI response: Copy, Like, Dislike, Regenerate, Share (Toolbar only when response exists) */}
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
                            <button
                              className="card-action-btn"
                              onClick={() => handleShare(c.text, `share-${messageId}`)}
                            >
                              {copiedIdx === `share-${messageId}` ? "Disalin" : "Share"}
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
                <div className="composer-input-row">
                  <textarea
                    className="composer-textarea"
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Tanya Nexa apa sahaja... (Shift+Enter untuk baris baru)"
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
              </div>
            </div>
          </>
        )}

        {/* Agent Engine Panel View */}
        {activeNav === "agent" && (
          <div className="sub-panel-container animate-fade">
            <div className="sub-panel-inner">
              <h2 className="panel-title">Hermes Autonomous Agent Engine</h2>
              <p className="panel-subtitle">
                Run autonomous multi-step software engineering tasks safely inside isolated workspaces.
              </p>

              {/* Repository & Branch Selectors (Read-Only Connected) */}
              <div className="grid-container" style={{ marginBottom: "20px" }}>
                <div className="flat-card">
                  <span className="flat-card-title">Repository</span>
                  <p className="flat-card-desc" style={{ marginBottom: "8px" }}>
                    Select target GitHub repository for metadata context.
                  </p>
                  <select
                    value={selectedRepo}
                    onChange={(e) => setSelectedRepo(e.target.value)}
                    disabled={reposLoading || repos.length === 0 || agentStatus === "pending" || agentStatus === "running"}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      color: "inherit",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  >
                    {reposLoading && <option value="">Loading repositories...</option>}
                    {!reposLoading && repos.length === 0 && <option value="">No repositories available</option>}
                    {repos.map(r => (
                      <option key={r.id || r.full_name} value={r.full_name}>
                        {r.full_name} {r.private ? "(Private)" : "(Public)"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flat-card">
                  <span className="flat-card-title">Branch</span>
                  <p className="flat-card-desc" style={{ marginBottom: "8px" }}>
                    Select target Git branch for metadata context.
                  </p>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    disabled={branchesLoading || branches.length === 0 || agentStatus === "pending" || agentStatus === "running"}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      color: "inherit",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  >
                    {branchesLoading && <option value="">Loading branches...</option>}
                    {!branchesLoading && branches.length === 0 && <option value="">No branches available</option>}
                    {branches.map(b => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Agent Task Workspace Card */}
              <div className="flat-card" style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span className="flat-card-title">Task Description</span>
                  {agentStatus !== "idle" && (
                    <span className={`agent-status-badge status-${agentStatus}`}>
                      Status: {agentStatus.toUpperCase()}
                    </span>
                  )}
                </div>

                <textarea
                  value={agentTaskInput}
                  onChange={(e) => setAgentTaskInput(e.target.value)}
                  placeholder="Terangkan tugasan ejen... (Contoh: Create a file called hello.txt containing Hello Nexa)"
                  disabled={agentStatus === "pending" || agentStatus === "running"}
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    color: "inherit",
                    fontSize: "14px",
                    lineHeight: "1.5",
                    outline: "none",
                    resize: "vertical",
                    marginBottom: "14px"
                  }}
                />

                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <button
                    className="card-action-btn"
                    onClick={handleRunAgent}
                    disabled={!agentTaskInput.trim() || !selectedRepo || !selectedBranch || agentStatus === "pending" || agentStatus === "running"}
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      padding: "10px 20px",
                      fontWeight: "600",
                      cursor: (!agentTaskInput.trim() || !selectedRepo || !selectedBranch || agentStatus === "pending" || agentStatus === "running") ? "not-allowed" : "pointer",
                      opacity: (!agentTaskInput.trim() || !selectedRepo || !selectedBranch || agentStatus === "pending" || agentStatus === "running") ? 0.6 : 1
                    }}
                  >
                    {agentStatus === "pending" || agentStatus === "running" ? "Running Agent..." : "Run Agent"}
                  </button>

                  <button
                    className="card-action-btn"
                    disabled
                    title="Safe stop mechanism coming in next update"
                    style={{ opacity: 0.5, cursor: "not-allowed" }}
                  >
                    Stop (coming soon)
                  </button>

                  {agentTaskId && (
                    <span style={{ fontSize: "12px", color: "var(--secondary-text)", marginLeft: "auto" }}>
                      Task ID: <code>{agentTaskId}</code>
                    </span>
                  )}
                </div>
              </div>

              {/* Activity Feed & Results */}
              {agentFeed.length > 0 && (
                <div className="flat-card" style={{ marginBottom: "20px" }}>
                  <span className="flat-card-title" style={{ marginBottom: "12px", display: "block" }}>Execution Activity Feed</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {agentFeed.map((item, idx) => (
                      <div key={idx} style={{ fontSize: "13px", color: item.startsWith("✖") ? "#EF4444" : "var(--primary-text)", fontFamily: "var(--mono)" }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Result / Output Viewer */}
              {agentResult && (
                <div className="flat-card" style={{ borderLeft: "4px solid var(--accent)", marginBottom: "20px" }}>
                  <span className="flat-card-title" style={{ marginBottom: "12px", display: "block" }}>Agent Output Result</span>
                  <div className="ai-card-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                      {agentResult}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Sandbox Diff Inspection & Human Approval Gate Card */}
              {agentStatus === "completed" && agentDiffData && (
                <div className="flat-card" style={{ borderLeft: "4px solid #3B82F6", marginBottom: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <span className="flat-card-title">
                      Changes detected: {agentDiffData.changed_files ? agentDiffData.changed_files.length : 0} file(s)
                    </span>
                    <button
                      className="card-action-btn"
                      onClick={() => setShowDiffViewer(!showDiffViewer)}
                    >
                      {showDiffViewer ? "Hide Changes" : "View Changes"}
                    </button>
                  </div>

                  {/* File List Summary */}
                  {agentDiffData.changed_files && agentDiffData.changed_files.length > 0 ? (
                    <div style={{ marginBottom: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {agentDiffData.changed_files.map((f, i) => (
                        <div key={i} style={{ fontSize: "13px", fontFamily: "var(--mono)", color: "var(--primary-text)" }}>
                          <span style={{
                            color: f.status === "added" ? "#22C55E" : f.status === "deleted" ? "#EF4444" : "#EAB308",
                            fontWeight: "600",
                            marginRight: "8px"
                          }}>
                            [{f.status}]
                          </span>
                          {f.path}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: "13px", color: "var(--secondary-text)", marginBottom: "14px" }}>
                      No files were changed.
                    </p>
                  )}

                  {/* Expanded Git Diff Code Viewer */}
                  {showDiffViewer && agentDiffData.diff && (
                    <div style={{ marginBottom: "16px" }}>
                      <SyntaxHighlighter
                        language="diff"
                        style={oneDark}
                        customStyle={{
                          margin: 0,
                          borderRadius: "8px",
                          padding: "14px",
                          fontSize: "12px",
                          lineHeight: "1.5",
                          maxHeight: "350px",
                          overflowY: "auto"
                        }}
                      >
                        {agentDiffData.diff}
                      </SyntaxHighlighter>
                    </div>
                  )}

                  {/* Human Approval Control Buttons & Commit/Push Trigger */}
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
                    <button
                      className="card-action-btn"
                      onClick={() => handleApprovalAction("approve")}
                      disabled={agentApprovalStatus === "approved"}
                      style={{
                        backgroundColor: agentApprovalStatus === "approved" ? "rgba(34, 197, 94, 0.2)" : "rgba(34, 197, 94, 0.15)",
                        color: "#22C55E",
                        borderColor: "#22C55E",
                        fontWeight: "600"
                      }}
                    >
                      {agentApprovalStatus === "approved" ? "✓ Changes Approved" : "Approve Changes"}
                    </button>

                    <button
                      className="card-action-btn"
                      onClick={() => handleApprovalAction("reject")}
                      disabled={agentApprovalStatus === "rejected"}
                      style={{
                        backgroundColor: agentApprovalStatus === "rejected" ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.15)",
                        color: "#EF4444",
                        borderColor: "#EF4444",
                        fontWeight: "600"
                      }}
                    >
                      {agentApprovalStatus === "rejected" ? "✖ Changes Rejected" : "Reject Changes"}
                    </button>

                    <button
                      className="card-action-btn"
                      onClick={() => setShowPushModal(true)}
                      disabled={agentApprovalStatus !== "approved" || !agentDiffData?.changed_files?.length}
                      style={{
                        backgroundColor: agentApprovalStatus === "approved" ? "var(--accent)" : "rgba(255, 255, 255, 0.05)",
                        color: agentApprovalStatus === "approved" ? "#fff" : "var(--secondary-text)",
                        border: "none",
                        fontWeight: "600",
                        cursor: agentApprovalStatus === "approved" && agentDiffData?.changed_files?.length ? "pointer" : "not-allowed",
                        opacity: agentApprovalStatus === "approved" && agentDiffData?.changed_files?.length ? 1 : 0.5
                      }}
                    >
                      Commit & Push
                    </button>

                    <span style={{ fontSize: "12px", color: "var(--secondary-text)", marginLeft: "auto" }}>
                      Approval Status: <strong style={{ color: agentApprovalStatus === "approved" ? "#22C55E" : agentApprovalStatus === "rejected" ? "#EF4444" : "#EAB308" }}>{agentApprovalStatus.toUpperCase()}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Error Output Viewer */}
              {agentError && (
                <div className="flat-card" style={{ borderLeft: "4px solid #EF4444" }}>
                  <span className="flat-card-title" style={{ color: "#EF4444", marginBottom: "8px", display: "block" }}>Execution Error</span>
                  <p style={{ fontSize: "13px", color: "var(--primary-text)", fontFamily: "var(--mono)", whiteSpace: "pre-wrap" }}>
                    {agentError}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Commit & Push Confirmation Modal */}
        {showPushModal && (
          <div className="sidebar-mobile-overlay" style={{ zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)" }}>
            <div className="flat-card" style={{ width: "90%", maxWidth: "500px", backgroundColor: "#18181B", border: "1px solid var(--border)", padding: "24px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>Commit & Push Approved Changes</h3>
              <p style={{ fontSize: "13px", color: "var(--secondary-text)", marginBottom: "16px" }}>
                Repository: <strong>{selectedRepo}</strong><br />
                Branch: <strong>{selectedBranch}</strong>
              </p>

              <label style={{ display: "block", fontSize: "12px", color: "var(--secondary-text)", marginBottom: "6px" }}>
                Commit Message (Max 200 chars)
              </label>
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="e.g. Fix login button styling"
                maxLength={200}
                disabled={pushLoading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: "inherit",
                  fontSize: "14px",
                  outline: "none",
                  marginBottom: "16px"
                }}
              />

              <div style={{ padding: "10px", borderRadius: "6px", backgroundColor: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", color: "#EAB308", fontSize: "12px", marginBottom: "16px" }}>
                ⚠️ Warning: This will commit the approved sandbox changes and push them directly to the selected GitHub branch.
              </div>

              {pushStatusMsg && (
                <p style={{ fontSize: "12px", color: "#22C55E", marginBottom: "12px" }}>{pushStatusMsg}</p>
              )}
              {pushErrorMsg && (
                <p style={{ fontSize: "12px", color: "#EF4444", marginBottom: "12px" }}>{pushErrorMsg}</p>
              )}

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  className="card-action-btn"
                  onClick={() => { setShowPushModal(false); setPushErrorMsg(null); setPushStatusMsg(null); }}
                  disabled={pushLoading}
                >
                  Cancel
                </button>

                <button
                  className="card-action-btn"
                  onClick={handlePushChanges}
                  disabled={!commitMessage.trim() || pushLoading}
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    fontWeight: "600",
                    opacity: (!commitMessage.trim() || pushLoading) ? 0.6 : 1
                  }}
                >
                  {pushLoading ? "Pushing..." : "Commit & Push"}
                </button>
              </div>
            </div>
          </div>
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
