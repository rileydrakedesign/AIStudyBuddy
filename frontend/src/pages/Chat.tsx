import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  LinearProgress,
} from "@mui/material";
import { useAuth } from "../context/authContext";
import ChatItem from "../components/chat/chatItem";
import { IoMdSend } from "react-icons/io";
import { useNavigate } from "react-router-dom";
import {
  getUserChatSessions,
  createChatSession,
  deleteChatSession,
  sendChatRequest,
  getUserClasses,
  getClassDocuments,
  deleteClass,
  deleteDocument,
  verifyUser,
  setReaction,
} from "../helpers/api-communicators";
import toast from "react-hot-toast";
import Loader from "../components/ui/loader";
import Header from "../components/Header.tsx";
import DocumentChat from "../components/chat/DocumentChat.tsx";
import ChatSidebar from "../components/chat/ChatSidebar";
import { initializeSocket } from "../helpers/socketClient";
import { Socket } from "socket.io-client";

/* ------------------------------
   TYPES
------------------------------ */
type ChunkReference = {
  chunkId: string;
  displayNumber: number;
  pageNumber?: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  citation?: { href: string | null; text: string }[];
  chunkReferences?: ChunkReference[];
  versions?: string[];
  currentVersion?: number;
  reaction?: "like" | "dislike" | null;
};

type ChatSession = {
  _id: string;
  sessionName: string;
  messages: Message[];
  assignedClass?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ClassOption = {
  name: string;
  _id: string;
};

type DocumentItem = {
  _id: string;
  fileName: string;
  className: string;
  isProcessing?: boolean;
};

/* ---- util to remove matching items ---- */
const withRemoved = <T,>(arr: T[], pred: (el: T) => boolean) =>
  arr.filter((el) => !pred(el));


/* ------------------------------
   COMPONENT
------------------------------ */
const Chat = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const auth = useAuth();

  // Chat session state
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);

  // Classes & selection
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  // New chat creation
  const [isNamingChat, setIsNamingChat] = useState(false);
  const [newChatName, setNewChatName] = useState("");

  // Streaming / loading state
  const [isGenerating, setIsGenerating] = useState(false);

  // Typewriter partial
  const [partialAssistantMessage, setPartialAssistantMessage] = useState("");
  const typeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sidebar
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [classDocs, setClassDocs] = useState<{ [className: string]: DocumentItem[] }>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Auto-scroll
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Document-based chat
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // Free-plan usage counter
  const [chatUsage, setChatUsage] = useState<{ count: number; limit: number } | null>(null);

  // User info for profile section
  const [userPlan, setUserPlan] = useState<string>("free");

  const socketRef = useRef<Socket | null>(null);

  // Track in‑flight deletions  (add below your existing state hooks)
  const [deletingChatIds, setDeletingChatIds] = useState<Set<string>>(new Set());
  const [deletingDocIds,  setDeletingDocIds]  = useState<Set<string>>(new Set());
  const [deletingClassIds, setDeletingClassIds] = useState<Set<string>>(new Set());



  const handleSetReaction = async (
    idx: number,
    newReaction: "like" | "dislike" | null
  ) => {
    // optimistic UI
    setChatMessages((prev) => {
      const next = [...prev];
      if (next[idx]?.role === "assistant") {
        next[idx] = { ...next[idx], reaction: newReaction };
      }
      return next;
    });
  
    try {
      if (currentChatSessionId)
        await setReaction(currentChatSessionId, idx, newReaction);
    } catch (err) {
      console.error("Failed to set reaction", err);
      // revert on error
      setChatMessages((prev) => {
        const next = [...prev];
        if (next[idx]?.role === "assistant") {
          next[idx] = { ...next[idx], reaction: null };
        }
        return next;
      });
    }
  };
  

  /* ------------------------------
     AUTO-RESIZE & CURSOR HANDLERS
  ------------------------------ */
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = "auto";
    target.style.height = Math.min(target.scrollHeight, 150) + "px";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    setTimeout(() => {
      const target = e.currentTarget;
      const length = target.value.length;
      target.setSelectionRange(length, length);
    }, 0);
  };

  /* ------------------------------
     SOCKET
  ------------------------------ */
  useEffect(() => {
    if (!auth?.isLoggedIn) return; // wait until cookies verified

    const socket = initializeSocket();
    socketRef.current = socket;

    const handleDocumentReady = (data: { docId: string; fileName: string; className: string }) => {

      setClassDocs((prev) => {
        const docs = prev[data.className] ?? [];
        const exists = docs.some((d) => d._id === data.docId);

        const updatedDocs = exists
          ? docs.map((d) => (d._id === data.docId ? { ...d, isProcessing: false } : d))
          : [
              ...docs,
              {
                _id: data.docId,
                fileName: data.fileName,
                className: data.className,
                isProcessing: false,
              },
            ];

        return { ...prev, [data.className]: updatedDocs };
      });
    };

    socket.on("document-ready", handleDocumentReady);

    return () => {
      socket.off("document-ready", handleDocumentReady);
    };
  }, [auth?.isLoggedIn]);

  // Removed toast-based document processing status; we now show inline spinners.

  /* ------------------------------
     FETCH CLASSES ON LOAD
  ------------------------------ */
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { classes }: { classes: ClassOption[] } = await getUserClasses();
        setClasses(classes);

        const storedClass = localStorage.getItem("selectedClass");

        // Auto-select first class if user has classes but no valid selection
        if (classes.length > 0) {
          if (storedClass === "null" || !storedClass) {
            // No class selected but classes exist - auto-select first class
            setSelectedClass(classes[0].name);
          } else if (classes.some((cls) => cls.name === storedClass)) {
            // Stored class is valid - use it
            setSelectedClass(storedClass);
          } else {
            // Stored class is invalid - auto-select first class
            setSelectedClass(classes[0].name);
          }
        } else {
          // No classes exist - set to null
          setSelectedClass(null);
        }
      } catch (error) {
        console.error("Error fetching classes", error);
      }
    };
    if (auth?.isLoggedIn) fetchClasses();
  }, [auth]);

  /* ------------------------------
     FETCH USAGE COUNTER (free plan) & USER PLAN
  ------------------------------ */
  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const data = await verifyUser();
        setUserPlan(data.plan || "free");
        if (data.plan === "free") setChatUsage({ count: data.chatRequestCount, limit: 25 });
      } catch (err) {
        console.error("Failed to fetch usage", err);
      }
    };
    if (auth?.isLoggedIn) fetchUsage();
  }, [auth]);

  /* ------------------------------
     AUTO-SELECT FIRST CLASS IF NEEDED
  ------------------------------ */
  useEffect(() => {
    // When classes change, ensure a valid class is selected if classes exist
    if (classes.length > 0) {
      setSelectedClass((currentSelection) => {
        // Check if current selection is valid
        const hasValidSelection = currentSelection && classes.some((cls) => cls.name === currentSelection);

        if (!hasValidSelection) {
          // No valid selection - auto-select first class
          return classes[0].name;
        }

        return currentSelection;
      });
    } else if (classes.length === 0) {
      setSelectedClass((currentSelection) => {
        // No classes exist - clear selection if not already null
        return currentSelection !== null ? null : currentSelection;
      });
    }
  }, [classes]); // Only depend on classes array

  /* ------------------------------
     SAVE SELECTED CLASS LOCALLY
  ------------------------------ */
  useEffect(() => {
    localStorage.setItem("selectedClass", selectedClass || "null");
  }, [selectedClass]);

  /* ------------------------------
     FETCH CHAT SESSIONS ON LOAD
  ------------------------------ */
  useEffect(() => {
    if (!(auth?.isLoggedIn && auth.user)) return;

    //toast.loading("Loading Chat Sessions", { id: "loadchatsessions" });
    getUserChatSessions()
      .then((data: { chatSessions: ChatSession[] }) => {
        const sessionsSorted = data.chatSessions.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        setChatSessions(sessionsSorted);

        if (sessionsSorted.length > 0) {
          const first = sessionsSorted[0];
          setCurrentChatSessionId(first._id);
          setChatMessages(collapseRetries(first.messages));
          setSelectedClass(first.assignedClass || null);
        }
        //toast.success("Successfully loaded chat sessions", { id: "loadchatsessions" });
      })
      .catch((err) => {
        console.error("Error loading chat sessions:", err);
        toast.error("Loading Chat Sessions Failed", { id: "loadchatsessions" });
      });
  }, [auth]);

  /* ------------------------------
     REDIRECT IF NOT LOGGED IN
  ------------------------------ */
  useEffect(() => {
    if (!auth) return;
    if (!auth.loading && !auth.user) navigate("/login");
  }, [auth, navigate]);

  /* ------------------------------
     SCROLLING
  ------------------------------ */
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isAtBottom && messagesEndRef.current)
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, partialAssistantMessage, isAtBottom]);

  /* ------------------------------
     CLEANUP ON UNMOUNT
  ------------------------------ */
  useEffect(() => {
    return () => {
      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
    };
  }, []);

  const finalizeTypewriter = () => {
    if (typeIntervalRef.current) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    const currentSession = chatSessions.find((s) => s._id === currentChatSessionId);
    if (currentSession && currentSession.messages.length > 0) {
      const finalMsg = currentSession.messages[currentSession.messages.length - 1];
      if (
        chatMessages.length === 0 ||
        chatMessages[chatMessages.length - 1].content !== finalMsg.content
      ) {
        setChatMessages((prev) => [...prev, finalMsg]);
      }
    }
    setPartialAssistantMessage("");
    setIsGenerating(false);
  };

  const handleStop = () => finalizeTypewriter();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !isGenerating) {
      event.preventDefault();
      handleSubmit();
    }
  };

  /* ------------------------------
     SUBMIT HANDLER
  ------------------------------ */
  const handleSubmit = async () => {
    
    /* ── limit check ───────────────────────────── */
    if (chatUsage && chatUsage.count >= chatUsage.limit) {
      toast.error("Monthly chat limit reached for the free plan");
      return;
    }

    if (!inputRef.current || !inputRef.current.value.trim()) return;
    const content = inputRef.current.value.trim();
    inputRef.current.value = "";

    const newMessage: Message = { role: "user", content };
    setChatMessages((prev) => [...prev, newMessage]);

    setIsGenerating(true);
    setPartialAssistantMessage("");

    try {
      let chatSessionId = currentChatSessionId;
      if (!chatSessionId) {
        const data = await createChatSession("New Chat");
        chatSessionId = data.chatSession._id;
        setCurrentChatSessionId(chatSessionId);
        setChatSessions((prev) => [
          {
            ...data.chatSession,
            assignedClass: null,
            updatedAt: data.chatSession.updatedAt || data.chatSession.createdAt,
          },
          ...prev,
        ]);
      }

      const classNameForRequest = selectedClass === null ? "null" : selectedClass;
      const chatData = await sendChatRequest(content, classNameForRequest, chatSessionId);

      // free-plan: increment local counter
      setChatUsage((prev) =>
        prev ? { ...prev, count: Math.min(prev.count + 1, prev.limit) } : prev
      );

      setChatSessions((prev) => {
        const updatedSessions = prev.map((session) =>
          session._id === chatData.chatSessionId
            ? {
                ...session,
                messages: chatData.messages,
                assignedClass: chatData.assignedClass || null,
                updatedAt: chatData.updatedAt || new Date().toISOString(),
              }
            : session
        );
        updatedSessions.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        return updatedSessions;
      });

      const allMessages = chatData.messages;

      const finalAssistantMsg =
        allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;

      if (!finalAssistantMsg || finalAssistantMsg.role !== "assistant") {
        setChatMessages(allMessages);
        setIsGenerating(false);
        return;
      }

      const updatedWithoutLast = allMessages.slice(0, allMessages.length - 1);
      setChatMessages(updatedWithoutLast);

      const fullText = finalAssistantMsg.content;
      let i = 0;

      if (typeIntervalRef.current) {
        clearInterval(typeIntervalRef.current);
      }

      typeIntervalRef.current = setInterval(() => {
        i += 1;
        setPartialAssistantMessage(fullText.substring(0, i));

        if (i >= fullText.length) {
          if (typeIntervalRef.current) {
            clearInterval(typeIntervalRef.current);
            typeIntervalRef.current = null;
          }
          setChatMessages([...updatedWithoutLast, finalAssistantMsg]);
          setPartialAssistantMessage("");
          setIsGenerating(false);
        }
      }, 2);

      if (chatData.assignedClass !== undefined) {
        setSelectedClass(chatData.assignedClass || null);
      }
    } catch (error: any) {
      console.error("Error in handleSubmit:", error);
      if (error.response && error.response.status === 403) {
        toast.error(
          error.response.data.message || "Monthly chat limit reached for the free plan"
        );
      } else {
        toast.error("Failed to send message");
      }
      setIsGenerating(false);
    }
  };

  const handlePresetPrompt = (prompt: string) => {
    if (isGenerating) return; // guard while streaming
    if (inputRef.current) {
      inputRef.current.value = prompt; // seed the textarea
    }
    handleSubmit(); // reuse the normal path
  };


  /* ------------------------------
     CREATE NEW CHAT
  ------------------------------ */
  const handleCreateNewChatSession = () => {
    setActiveDocId(null);
    setIsNamingChat(true);
    setNewChatName("");
  };

  const handleSubmitNewChatName = async () => {
    if (newChatName.trim() === "") {
      toast.error("Please enter a chat name");
      return;
    }
    try {
      // Pass the currently selected class to assign the chat to that class
      const data = await createChatSession(newChatName.trim(), selectedClass);
      const newSession = {
        ...data.chatSession,
        assignedClass: selectedClass,
        lastUpdated: Date.now(),
      };
      setChatSessions((prev) => [newSession, ...prev]);
      setCurrentChatSessionId(newSession._id);
      setChatMessages([]);
      // Keep the selected class instead of resetting to null
      setIsNamingChat(false);
      setNewChatName("");
    } catch (err) {
      console.error("Error creating new chat session:", err);
      toast.error("Failed to create new chat session");
    }
  };

  const handleCancelNewChat = () => {
    setIsNamingChat(false);
    setNewChatName("");
  };

  /* ------------------------------
     SELECT A CHAT SESSION
  ------------------------------ */
  const handleSelectChatSession = (chatSessionId: string) => {
    setActiveDocId(null);
    window.dispatchEvent(new CustomEvent("clearCitationPopups"));

    const session = chatSessions.find((s) => s._id === chatSessionId);
    if (session) {
      setCurrentChatSessionId(chatSessionId);
      setChatMessages(collapseRetries(session.messages)); 
      setSelectedClass(session.assignedClass || null);
    }
  };

  /* ------------------------------
     RENAME A CHAT SESSION
  ------------------------------ */
  const handleRenameChatSession = (chatSessionId: string, newName: string) => {
    setChatSessions((prev) =>
      prev.map((session) =>
        session._id === chatSessionId
          ? { ...session, sessionName: newName }
          : session
      )
    );
  };

  /* ------------------------------
     DELETE A CHAT SESSION
  ------------------------------ */
  // DELETE A CHAT SESSION (optimistic + guarded)
  const handleDeleteChatSession = async (chatSessionId: string) => {
    if (deletingChatIds.has(chatSessionId)) return;          // already deleting
    setDeletingChatIds((prev) => new Set(prev).add(chatSessionId));

    // --- optimistic snapshot ---
    const prevSessions = chatSessions;
    const prevCurrent  = currentChatSessionId;
    const prevMsgs     = chatMessages;
    const prevSelClass = selectedClass;

    setChatSessions(withRemoved(chatSessions, (s) => s._id === chatSessionId));

    if (currentChatSessionId === chatSessionId) {
      const remaining = withRemoved(chatSessions, (s) => s._id === chatSessionId);
      if (remaining.length) {
        const next = remaining[0];
        setCurrentChatSessionId(next._id);
        setChatMessages(next.messages);
        setSelectedClass(next.assignedClass || null);
      } else {
        setCurrentChatSessionId(null);
        setChatMessages([]);
        setSelectedClass(null);
      }
    }

    try {
      await deleteChatSession(chatSessionId);
      toast.success("Chat deleted");
    } catch (err) {
      console.error("Error deleting chat session:", err);
      toast.error("Failed to delete chat session");
      // rollback
      setChatSessions(prevSessions);
      setCurrentChatSessionId(prevCurrent);
      setChatMessages(prevMsgs);
      setSelectedClass(prevSelClass);
    } finally {
      setDeletingChatIds((prev) => {
        const next = new Set(prev);
        next.delete(chatSessionId);
        return next;
      });
    }
  };

  /* ------------------------------
     DELETE A CLASS
  ------------------------------ */
  /* ------------------------------
   DELETE A CLASS  (optimistic + guarded)
  ------------------------------ */
  const handleDeleteClass = async (classId: string) => {
    if (deletingClassIds.has(classId)) return;          // already in flight
    setDeletingClassIds((prev) => new Set(prev).add(classId));

    // snapshot for rollback
    const prevClasses      = classes;
    const prevClassDocs    = classDocs;
    const prevChatSessions = chatSessions;
    const prevSelected     = selectedClass;
    const prevExpanded     = expandedClass;

    // Find the class name before deletion
    const cls = prevClasses.find((c) => c._id === classId);
    const className = cls?.name;

    // optimistic UI: remove class + its docs + its chats immediately
    setClasses(withRemoved(classes, (c) => c._id === classId));
    setClassDocs((prev) => {
      const next = { ...prev };
      if (cls) delete next[cls.name];
      return next;
    });
    // Remove chat sessions assigned to this class
    if (className) {
      setChatSessions((prev) => prev.filter((session) => session.assignedClass !== className));
    }
    if (selectedClass && className === selectedClass) {
      setSelectedClass(null);
    }
    if (expandedClass && className === expandedClass) {
      setExpandedClass(null);
    }

    try {
      await deleteClass(classId);
      toast.success("Class deleted");
    } catch (err) {
      console.error("Error deleting class:", err);
      toast.error("Failed to delete class");
      // rollback
      setClasses(prevClasses);
      setClassDocs(prevClassDocs);
      setChatSessions(prevChatSessions);
      setSelectedClass(prevSelected);
      setExpandedClass(prevExpanded);
    } finally {
      setDeletingClassIds((prev) => {
        const next = new Set(prev);
        next.delete(classId);
        return next;
      });
    }
  };


  /* ------------------------------
     DELETE A DOCUMENT
  ------------------------------ */
  // DELETE A DOCUMENT (optimistic + guarded)
  const handleDeleteDocument = async (docId: string, className: string) => {
    if (deletingDocIds.has(docId)) return;
    setDeletingDocIds((prev) => new Set(prev).add(docId));

    // optimistic snapshot
    const prevDocs = classDocs[className] ?? [];
    setClassDocs((prev) => ({
      ...prev,
      [className]: withRemoved(prevDocs, (d) => d._id === docId),
    }));

    try {
      await deleteDocument(docId);
      toast.success("Document deleted");
    } catch (err) {
      console.error("Error deleting document:", err);
      toast.error("Failed to delete document");
      // rollback
      setClassDocs((prev) => ({ ...prev, [className]: prevDocs }));
    } finally {
      setDeletingDocIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };


  /* ------------------------------
     Classes & Documents
  ------------------------------ */
  const handleToggleClass = async (clsName: string) => {
    if (expandedClass === clsName) {
      setExpandedClass(null);
      return;
    }
    setExpandedClass(clsName);
    if (!classDocs[clsName]) {
      try {
        const docs = await getClassDocuments(clsName);
        setClassDocs((prev) => ({ ...prev, [clsName]: docs }));
      } catch (err) {
        console.error("Failed to fetch documents for class:", clsName, err);
        toast.error("Failed to fetch documents for " + clsName);
      }
    }
  };

  const handleOpenDocumentChat = (docId: string) => {
    finalizeTypewriter();
    setActiveDocId(docId);
  };


  /* ------------------------------
   RETRY CHAT
  ------------------------------ */
  const handleRetry = async (assistantIdx: number) => {
    if (isGenerating) return;                        // block while streaming
    if (assistantIdx <= 0 || assistantIdx >= chatMessages.length) return;

    const userMsg = chatMessages[assistantIdx - 1];
    const assistantMsg = chatMessages[assistantIdx];
    if (userMsg.role !== "user" || assistantMsg.role !== "assistant") return;

    try {
      setIsGenerating(true);

      const classNameForRequest = selectedClass === null ? "null" : selectedClass;

      // send the same prompt with retry flag = true
      const chatData = await sendChatRequest(
        userMsg.content,
        classNameForRequest,
        currentChatSessionId,
        undefined,   // docId
        false,       // ephemeral
        true         // retry
      );

      // Replace local messages with the server’s list collapsed into one bubble
      setChatMessages(collapseRetries(chatData.messages));
    } catch (err) {
      console.error("Retry failed", err);
      toast.error("Retry failed");
      // nothing to roll back: local state unchanged
    } finally {
      setIsGenerating(false);
    }
  };


  const collapseRetries = (messages: Message[]): Message[] => {
    const out: Message[] = [];
  
    messages.forEach((msg) => {
      if (
        msg.role === "assistant" &&
        out.length &&
        out[out.length - 1].role === "assistant"
      ) {
        // Merge as retry version
        const prev = out[out.length - 1];
        if (!prev.versions) prev.versions = [prev.content];
        prev.versions.push(msg.content);
        prev.currentVersion = prev.versions.length - 1;
        prev.content = msg.content; // show newest by default
      } else {
        out.push({ ...msg });
      }
    });
  
    return out;
  };  

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  if (!auth?.isLoggedIn) return null;

  /* ------------------------------
     RENDER
  ------------------------------ */
  return (
    <Box sx={{ width: "100%", height: "100vh", overflow: "hidden" }}>
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />

      <Box
        sx={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "calc(100vh - 64px)",
          marginTop: "64px",
        }}
      >
        {/* -------------------- SIDEBAR -------------------- */}
        <ChatSidebar
          sidebarOpen={sidebarOpen}
          chatSessions={chatSessions}
          currentChatSessionId={currentChatSessionId}
          onSelectChatSession={handleSelectChatSession}
          onDeleteChatSession={handleDeleteChatSession}
          onCreateNewChatSession={handleCreateNewChatSession}
          isNamingChat={isNamingChat}
          newChatName={newChatName}
          onNewChatNameChange={setNewChatName}
          onSubmitNewChatName={handleSubmitNewChatName}
          onCancelNewChat={handleCancelNewChat}
          onRenameChatSession={handleRenameChatSession}
          classes={classes}
          selectedClass={selectedClass}
          onSelectClass={setSelectedClass}
          onCreateNewClass={() => navigate("/upload")}
          classDocs={classDocs}
          expandedClass={expandedClass}
          onToggleClass={handleToggleClass}
          onOpenDocumentChat={handleOpenDocumentChat}
          onDeleteDocument={handleDeleteDocument}
          onDeleteClass={handleDeleteClass}
          isGenerating={isGenerating}
          deletingChatIds={deletingChatIds}
          deletingDocIds={deletingDocIds}
          deletingClassIds={deletingClassIds}
          userEmail={auth?.user?.email || ""}
          userPlan={userPlan}
          onNavigateToProfile={() => navigate("/profile")}
        />

        {/* -------------------- MAIN CHAT -------------------- */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            height: "100%",
            overflow: "hidden",
            marginLeft: sidebarOpen ? "280px" : "70px",
            transition: "margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)",
            p: 2,
            boxSizing: "border-box",
          }}
        >
          {activeDocId ? (
            <DocumentChat key={activeDocId} docId={activeDocId} onClose={() => setActiveDocId(null)} />
          ) : (
            <>
              {/* Free-plan chat counter */}
              {chatUsage && (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", mb: 2 }}>
                  <Typography sx={{ mr: 1, color: "white" }}>
                    {`${chatUsage.count}/${chatUsage.limit}`}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(chatUsage.count / chatUsage.limit) * 100}
                    sx={{ width: 100, height: 8, bgcolor: "#424242", borderRadius: 1 }}
                  />
                </Box>
              )}

              {/* Chat Messages Container */}
              {chatMessages.length === 0 && partialAssistantMessage === "" ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexGrow: 1,
                    textAlign: "center",
                  }}
                >
                  <Typography variant="h2" sx={{ mb: 3, fontWeight: 700 }}>
                    How can Class Chat help?
                  </Typography>

                  <Box sx={{ width: "100%", maxWidth: 600, mb: 3 }}>
                    <Box
                      sx={{
                        width: "100%",
                        borderRadius: 'var(--radius-lg)',
                        backgroundColor: "background.paper",
                        border: "2px solid",
                        borderColor: "primary.main",
                        display: "flex",
                        alignItems: "center",
                        boxShadow: "0 0 20px rgba(14, 165, 233, 0.3)",
                      }}
                    >
                      <textarea
                        ref={inputRef}
                        disabled={isGenerating}
                        placeholder="Ask away..." 
                        onKeyDown={handleKeyDown}
                        onInput={handleInput}
                        onPaste={handlePaste}
                        rows={1}
                        style={{
                          width: "100%",
                          backgroundColor: "transparent",
                          padding: "16px",
                          border: "none",
                          outline: "none",
                          color: "white",
                          fontSize: "18px",
                          resize: "none",
                          overflowY: "auto",
                          maxHeight: "150px",
                        }}
                      />
                      {!isGenerating ? (
                        <IconButton onClick={handleSubmit} sx={{ color: "white", mx: 1 }}>
                          <IoMdSend />
                        </IconButton>
                      ) : (
                        <IconButton onClick={handleStop} sx={{ color: "white", mx: 1 }}>
                          <Box sx={{ width: 16, height: 16, backgroundColor: "white" }} />
                        </IconButton>
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", gap: 2 }}>
                    <Button
                      variant="contained"
                      disabled={isGenerating}
                      onClick={() => handlePresetPrompt("Create a study guide for this class")}
                      sx={{
                        color: "white",
                        backgroundColor: "primary.main",
                        "&:hover": {
                          backgroundColor: "primary.dark",
                        },
                      }}
                    >
                      📖 Create Study Guide
                    </Button>

                    <Button
                      variant="contained"
                      disabled={isGenerating}
                      onClick={() => handlePresetPrompt("Summarize this class")}
                      sx={{
                        color: "white",
                        backgroundColor: "primary.main",
                        "&:hover": {
                          backgroundColor: "primary.dark",
                        },
                      }}
                    >
                      📝 Generate Summary
                    </Button>
                  </Box>
                </Box>
              ) : (
                <>
                  {/* Chat scroll area */}
                  <Box
                    ref={chatContainerRef}
                    sx={{
                      flexGrow: 1,
                      borderRadius: 3,
                      display: "flex",
                      flexDirection: "column",
                      overflowY: "auto",
                      overflowX: "hidden",
                      scrollBehavior: "smooth",
                      mb: 2,
                      boxSizing: "border-box",
                      position: "relative",
                      zIndex: 2,
                    }}
                  >
                    {chatMessages.map((chat, index) => (
                      <ChatItem
                        key={index}
                        content={chat.content}
                        role={chat.role}
                        citation={chat.citation && chat.citation.length ? chat.citation : undefined}
                        chunkReferences={chat.chunkReferences}
                        onDocumentChat={handleOpenDocumentChat}
                        messageIndex={index}
                        onRetry={handleRetry}
                        versions={chat.versions}
                        currentVersion={chat.currentVersion}
                        reaction={chat.reaction ?? null}
                        onSetReaction={handleSetReaction}
                      />
                    ))}

                    {isGenerating && partialAssistantMessage && (
                      <ChatItem 
                        content={partialAssistantMessage} 
                        role="assistant" 
                        messageIndex={chatMessages.length}
                      />
                    )}

                    {isGenerating && !partialAssistantMessage && (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          m: 1,
                          transform: "scale(0.25)",
                          transformOrigin: "left top",
                        }}
                      >
                        <Loader />
                      </Box>
                    )}

                    <div ref={messagesEndRef} />
                  </Box>

                  {/* Input Section */}
                  <Box
                    sx={{
                      width: "100%",
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: "background.paper",
                      border: "1px solid",
                      borderColor: "divider",
                      display: "flex",
                      alignItems: "center",
                      mb: 2,
                    }}
                  >
                    <textarea
                      ref={inputRef}
                      disabled={isGenerating}
                      onKeyDown={handleKeyDown}
                      onInput={handleInput}
                      onPaste={handlePaste}
                      style={{
                        width: "100%",
                        backgroundColor: "transparent",
                        padding: "16px",
                        border: "none",
                        outline: "none",
                        color: "white",
                        fontSize: "18px",
                        resize: "none",
                        overflowY: "auto",
                        maxHeight: "150px",
                      }}
                    />
                    {!isGenerating ? (
                      <IconButton onClick={handleSubmit} sx={{ color: "white", mx: 1 }}>
                        <IoMdSend />
                      </IconButton>
                    ) : (
                      <IconButton onClick={handleStop} sx={{ color: "white", mx: 1 }}>
                        <Box sx={{ width: 16, height: 16, backgroundColor: "white" }} />
                      </IconButton>
                    )}
                  </Box>
                </>
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default Chat;
