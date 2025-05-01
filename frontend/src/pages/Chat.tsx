import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  MenuItem,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  ListSubheader,
  Divider,
  ListItemIcon,
  Collapse,
  LinearProgress,
} from "@mui/material";
import red from "@mui/material/colors/red";
import { useAuth } from "../context/authContext";
import ChatItem from "../components/chat/chatItem";
import { IoMdSend } from "react-icons/io";
import { useNavigate } from "react-router-dom";
import {
  getUserChatSessions,
  createChatSession,
  deleteChatSession,
  deleteAllChatSessions,
  sendChatRequest,
  getUserClasses,
  getClassDocuments,
  deleteClass,
  deleteDocument,
  verifyUser,
} from "../helpers/api-communicators";
import toast from "react-hot-toast";
import ChatBubbleIcon from "@mui/icons-material/ChatBubble";
import StyleIcon from "@mui/icons-material/Style";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Loader from "../components/ui/loader";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Header from "../components/Header.tsx";
import DocumentChat from "../components/chat/DocumentChat.tsx";
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

type Chunk = {
  chunkNumber: number;
  text: string;
};

type DocumentItem = {
  _id: string;
  fileName: string;
  className: string;
  isProcessing?: boolean;
};

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

  // Chunks for bracket references (ephemeral)
  const [chunks, setChunks] = useState<Chunk[]>([]);

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

  const socketRef = useRef<Socket | null>(null);

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
      toast.success(`${data.fileName} finished processing`, { id: `processing-${data.docId}` });

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

  /* ------------------------------
     toast loader for docs
  ------------------------------ */
  useEffect(() => {
    Object.values(classDocs)
      .flat()
      .forEach((doc) => {
        const id = `processing-${doc._id}`;
        if (doc.isProcessing) {
          toast.loading(`Processing ${doc.fileName}…`, { id });
        } else {
          toast.dismiss(id);
        }
      });
  }, [classDocs]);

  /* ------------------------------
     FETCH CLASSES ON LOAD
  ------------------------------ */
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { classes }: { classes: ClassOption[] } = await getUserClasses();
        setClasses(classes);

        const storedClass = localStorage.getItem("selectedClass");
        if (storedClass === "null") {
          setSelectedClass(null);
        } else if (storedClass && classes.some((cls) => cls.name === storedClass)) {
          setSelectedClass(storedClass);
        }
      } catch (error) {
        console.error("Error fetching classes", error);
      }
    };
    if (auth?.isLoggedIn) fetchClasses();
  }, [auth]);

  /* ------------------------------
     FETCH USAGE COUNTER (free plan)
  ------------------------------ */
  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const data = await verifyUser();
        if (data.plan === "free") setChatUsage({ count: data.chatRequestCount, limit: 25 });
      } catch (err) {
        console.error("Failed to fetch usage", err);
      }
    };
    if (auth?.isLoggedIn) fetchUsage();
  }, [auth]);

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
          setChatMessages(first.messages);
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
    if (!auth?.user) navigate("/login");
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

  /* ------------------------------
     CLASS SELECT CHANGE
  ------------------------------ */
  const handleClassChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const c = event.target.value === "null" ? null : event.target.value;
    setSelectedClass(c);
  };

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

      setChunks(chatData.chunks || []);

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
      const data = await createChatSession(newChatName.trim());
      const newSession = {
        ...data.chatSession,
        assignedClass: null,
        lastUpdated: Date.now(),
      };
      setChatSessions((prev) => [newSession, ...prev]);
      setCurrentChatSessionId(newSession._id);
      setChatMessages([]);
      setSelectedClass(null);
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
      setChatMessages(session.messages);
      setSelectedClass(session.assignedClass || null);
    }
  };

  /* ------------------------------
     DELETE A CHAT SESSION
  ------------------------------ */
  const handleDeleteChatSession = async (chatSessionId: string) => {
    try {
      await deleteChatSession(chatSessionId);
      setChatSessions((prev) => prev.filter((session) => session._id !== chatSessionId));
      if (currentChatSessionId === chatSessionId) {
        const remaining = chatSessions.filter((s) => s._id !== chatSessionId);
        if (remaining.length > 0) {
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
    } catch (error) {
      console.error("Error deleting chat session:", error);
      toast.error("Failed to delete chat session");
    }
  };

  /* ------------------------------
     DELETE A CLASS
  ------------------------------ */
  const handleDeleteClass = async (classId: string) => {
    try {
      await deleteClass(classId);
      setClasses((prev) => prev.filter((c) => c._id !== classId));

      setClassDocs((prev) => {
        const updated = { ...prev };
        return updated;
      });

      toast.success("Class deleted");
    } catch (error) {
      console.error("Error deleting class:", error);
      toast.error("Failed to delete class");
    }
  };

  /* ------------------------------
     DELETE A DOCUMENT
  ------------------------------ */
  const handleDeleteDocument = async (docId: string, className: string) => {
    try {
      await deleteDocument(docId);
      setClassDocs((prev) => {
        const updated = { ...prev };
        if (updated[className]) {
          updated[className] = updated[className].filter((doc) => doc._id !== docId);
        }
        return updated;
      });

      toast.success("Document deleted");
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete document");
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
     DELETE ALL CHAT SESSIONS
  ------------------------------ */
  const handleDeleteAllChatSessions = async () => {
    try {
      await deleteAllChatSessions();
      setChatSessions([]);
      setCurrentChatSessionId(null);
      setChatMessages([]);
      setSelectedClass(null);
      toast.success("All chat sessions deleted");
    } catch (error) {
      console.error("Error deleting all chat sessions:", error);
      toast.error("Failed to delete all chat sessions");
    }
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
        {sidebarOpen && (
          <Box
            sx={{
              display: "flex",
              flex: "0 0 300px",
              flexDirection: "column",
              boxShadow: "2px 0 5px rgba(0,0,0,0.8)",
              bgcolor: "#004d5612",
              overflowY: "auto",
            }}
          >
            {/* Chats */}
            <List
              sx={{ color: "white", mt: 2 }}
              subheader={
                <ListSubheader
                  component="div"
                  id="chats-list-subheader"
                  sx={{
                    bgcolor: "inherit",
                    color: "white",
                    fontSize: "1.2em",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <ChatBubbleIcon sx={{ mr: 1 }} />
                    Chats
                  </Box>
                  <IconButton onClick={toggleSidebar} sx={{ color: "white" }} size="small">
                    {sidebarOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
                  </IconButton>
                </ListSubheader>
              }
            >
              {isNamingChat ? (
                <Box
                  sx={{
                    mx: "auto",
                    my: 2,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    value={newChatName}
                    onChange={(e) => setNewChatName(e.target.value)}
                    placeholder="Enter chat name"
                    style={{
                      width: "200px",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      marginBottom: "8px",
                      color: "black",
                    }}
                  />
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      onClick={handleSubmitNewChatName}
                      sx={{
                        color: "white",
                        fontWeight: "700",
                        borderRadius: 3,
                        bgcolor: "blue",
                        ":hover": { bgcolor: "darkblue" },
                      }}
                    >
                      Create
                    </Button>
                    <Button
                      onClick={handleCancelNewChat}
                      sx={{
                        color: "white",
                        fontWeight: "700",
                        borderRadius: 3,
                        bgcolor: red[300],
                        ":hover": { bgcolor: red.A400 },
                      }}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              ) : (
                <ListItemButton onClick={handleCreateNewChatSession} disabled={isGenerating} sx={{ pl: 2 }}>
                  <ListItemIcon sx={{ color: "white" }}>
                    <AddIcon />
                  </ListItemIcon>
                  <ListItemText primary="New Chat" sx={{ color: "white" }} />
                </ListItemButton>
              )}

              {chatSessions.map((session) => (
                <ListItemButton
                  key={session._id}
                  className="chat-list-item"
                  selected={session._id === currentChatSessionId}
                  disabled={isGenerating}
                  onClick={() => handleSelectChatSession(session._id)}
                  sx={{ pl: 3 }}
                >
                  <ListItemText primary={session.sessionName} />
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteChatSession(session._id);
                    }}
                    sx={{
                      color: "red",
                      opacity: 0,
                      transition: "opacity 0.3s",
                      ".chat-list-item:hover &": { opacity: 1 },
                    }}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </ListItemButton>
              ))}
            </List>

            <Divider sx={{ backgroundColor: "white", my: 2 }} />

            {/* Classes */}
            <List
              sx={{ color: "white" }}
              subheader={
                <ListSubheader
                  component="div"
                  id="classes-list-subheader"
                  sx={{
                    bgcolor: "inherit",
                    color: "white",
                    fontSize: "1.2em",
                    fontWeight: "bold",
                  }}
                >
                  <StyleIcon sx={{ mr: 1 }} />
                  Classes
                </ListSubheader>
              }
            >
              <ListItemButton sx={{ pl: 2 }} disabled={isGenerating} onClick={() => navigate("/upload")}>
                <ListItemIcon sx={{ color: "white" }}>
                  <AddIcon />
                </ListItemIcon>
                <ListItemText primary="New Class" sx={{ color: "white" }} />
              </ListItemButton>

              {classes.map((cls) => (
                <React.Fragment key={cls._id}>
                  <ListItemButton
                    sx={{ pl: 2 }}
                    className="class-list-item"
                    onClick={() => handleToggleClass(cls.name)}
                  >
                    <ListItemIcon sx={{ color: "white" }}>
                      {expandedClass === cls.name ? <ExpandLess /> : <ExpandMore />}
                    </ListItemIcon>
                    <ListItemText primary={cls.name} sx={{ color: "white" }} />

                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClass(cls._id);
                      }}
                      sx={{
                        color: "red",
                        opacity: 0,
                        transition: "opacity 0.3s",
                        ".class-list-item:hover &": { opacity: 1 },
                      }}
                    >
                      <DeleteOutlineIcon />
                    </IconButton>
                  </ListItemButton>

                  <Collapse in={expandedClass === cls.name} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding sx={{ pl: 6 }}>
                      {classDocs[cls.name] && classDocs[cls.name].length > 0 ? (
                        classDocs[cls.name].map((doc) => (
                          <ListItem key={doc._id} sx={{ color: "white" }} className="doc-list-item">
                            <Button
                              disabled={isGenerating || doc.isProcessing}
                              onClick={() => handleOpenDocumentChat(doc._id)}
                              sx={{
                                color: "#1976d2",
                                textTransform: "none",
                                "&.Mui-disabled": {
                                  color: "rgba(25,118,210, 0.5)",
                                },
                              }}
                            >
                              {doc.fileName}
                            </Button>

                            <IconButton
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDocument(doc._id, doc.className);
                              }}
                              sx={{
                                color: "red",
                                ml: 1,
                                opacity: 0,
                                transition: "opacity 0.3s",
                                ".doc-list-item:hover &": { opacity: 1 },
                              }}
                            >
                              <DeleteOutlineIcon />
                            </IconButton>
                          </ListItem>
                        ))
                      ) : classDocs[cls.name] ? (
                        <ListItem sx={{ color: "gray" }}>
                          <ListItemText primary="No documents found" />
                        </ListItem>
                      ) : (
                        <ListItem sx={{ color: "gray" }}>
                          <ListItemText primary="Loading documents..." />
                        </ListItem>
                      )}
                    </List>
                  </Collapse>
                </React.Fragment>
              ))}
            </List>
          </Box>
        )}

        {/* Hover toggle area when sidebar is closed */}
        {!sidebarOpen && (
          <Box
            onClick={toggleSidebar}
            sx={{
              position: "absolute",
              left: 0,
              top: "64px",
              bottom: 0,
              width: "30px",
              backgroundColor: "transparent",
              "&:hover": { backgroundColor: "#004d5612" },
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 1200,
            }}
          >
            <ChevronRightIcon sx={{ color: "white" }} />
          </Box>
        )}

        {/* -------------------- MAIN CHAT -------------------- */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            height: "100%",
            overflow: "hidden",
            p: 2,
            boxSizing: "border-box",
          }}
        >
          {activeDocId ? (
            <DocumentChat docId={activeDocId} onClose={() => setActiveDocId(null)} />
          ) : (
            <>
              {/* Class Selector + free-plan chat counter */}
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <TextField
                  id="class-select"
                  select
                  label="Select Class"
                  value={selectedClass || "null"}
                  onChange={handleClassChange}
                  variant="outlined"
                  sx={{ minWidth: 160, "& .MuiSvgIcon-root": { color: "white" }, mr: 2 }}
                  InputProps={{ sx: { color: "white" } }}
                  SelectProps={{
                    MenuProps: {
                      PaperProps: {
                        sx: {
                          bgcolor: "#424242",
                          "& .MuiMenuItem-root": {
                            color: "white",
                            "&.Mui-selected": {
                              bgcolor: "#616161",
                              color: "white",
                              "&:hover": { bgcolor: "#616161" },
                            },
                            "&:hover": { bgcolor: "#757575" },
                          },
                        },
                      },
                    },
                  }}
                >
                  <MenuItem value="null">
                    <em>All Classes</em>
                  </MenuItem>
                  {classes.map((cls) => (
                    <MenuItem key={cls._id} value={cls.name}>
                      {cls.name}
                    </MenuItem>
                  ))}
                </TextField>

                {chatUsage && (
                  <Box sx={{ ml: "auto", display: "flex", alignItems: "center", minWidth: 140 }}>
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
              </Box>

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
                  <Typography variant="h4" sx={{ mb: 3 }}>
                    How can Class Chat help?
                  </Typography>

                  <Box sx={{ width: "100%", maxWidth: 600, mb: 3 }}>
                    <Box
                      sx={{
                        width: "100%",
                        borderRadius: 2,
                        backgroundColor: "rgb(17,27,39)",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <textarea
                        ref={inputRef}
                        disabled={isGenerating}
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
                    <Button variant="contained">Create Study Guide</Button>
                    <Button variant="contained">Generate Notes</Button>
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
                      />
                    ))}

                    {isGenerating && partialAssistantMessage && (
                      <ChatItem content={partialAssistantMessage} role="assistant" />
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
                      borderRadius: 2,
                      backgroundColor: "#1d2d44",
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
