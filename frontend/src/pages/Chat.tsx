import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  ListSubheader,
  Divider,
  ListItemIcon,
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
} from "../helpers/api-communicators";
import toast from "react-hot-toast";
import ChatIcon from "@mui/icons-material/Chat";
import ClassIcon from "@mui/icons-material/Book";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Loader from "../components/ui/loader";
import ChatBubbleIcon from '@mui/icons-material/ChatBubble'; // Chat icon
import StyleIcon from '@mui/icons-material/Style'; // Class icon

/* ------------------------------
   TYPES
   ------------------------------ */
type Message = {
  role: "user" | "assistant";
  content: string;
  citation?: { href: string | null; text: string }[];
};

type ChatSession = {
  _id: string;
  sessionName: string;
  messages: Message[];
  assignedClass?: string | null;
};

type ClassOption = {
  name: string;
  _id: string;
};

/* ------------------------------
   COMPONENT
   ------------------------------ */
const Chat = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  // Streaming state
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialAssistantMessage, setPartialAssistantMessage] = useState<string>("");

  // For auto-scroll
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
        } else if (
          storedClass &&
          classes.some((cls: ClassOption) => cls.name === storedClass)
        ) {
          setSelectedClass(storedClass);
        }
      } catch (error) {
        console.error("Error fetching classes", error);
      }
    };

    if (auth?.isLoggedIn) {
      fetchClasses();
    }
  }, [auth]);

  /* ------------------------------
     SAVE SELECTED CLASS LOCALLY (OPTIONAL)
     ------------------------------ */
  useEffect(() => {
    localStorage.setItem("selectedClass", selectedClass || "null");
  }, [selectedClass]);

  /* ------------------------------
     FETCH CHAT SESSIONS ON LOAD
     ------------------------------ */
  useEffect(() => {
    if (auth?.isLoggedIn && auth.user) {
      toast.loading("Loading Chat Sessions", { id: "loadchatsessions" });
      getUserChatSessions()
        .then((data) => {
          setChatSessions(data.chatSessions);

          if (data.chatSessions.length > 0) {
            // Default to the first session
            const first = data.chatSessions[0];
            setCurrentChatSessionId(first._id);
            setChatMessages(first.messages);
            setSelectedClass(first.assignedClass || null);
          }
          toast.success("Successfully loaded chat sessions", { id: "loadchatsessions" });
        })
        .catch((err) => {
          console.error(err);
          toast.error("Loading Chat Sessions Failed", { id: "loadchatsessions" });
        });
    }
  }, [auth]);

  /* ------------------------------
     REDIRECT IF NOT LOGGED IN
     ------------------------------ */
  useEffect(() => {
    if (!auth?.user) {
      navigate("/login");
    }
  }, [auth, navigate]);

  /* ------------------------------
     AUTO-SCROLL TO BOTTOM
     ------------------------------ */
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, partialAssistantMessage]);

  /* ------------------------------
     CLASS SELECT CHANGE
     ------------------------------ */
  const handleClassChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const c = event.target.value === "null" ? null : event.target.value;
    setSelectedClass(c);
  };

  /* 
     STOP HANDLER:
     Called when user presses the "Stop" button to end LLM generation.
     You can adapt it to clear any streaming intervals as needed.
  */
  const handleStop = () => {
    setIsGenerating(false);
    // Optionally: setPartialAssistantMessage(""); 
    // or do additional cleanup for streaming intervals if you are storing them.
  };

  // Press Enter to submit
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !isGenerating) {
      event.preventDefault();
      handleSubmit();
    }
  };

  /* ------------------------------
     SUBMIT HANDLER (STREAMING)
     ------------------------------ */
  const handleSubmit = async () => {
    if (!inputRef.current || !inputRef.current.value.trim()) return;
    const content = inputRef.current.value.trim();
    inputRef.current.value = "";

    const newMessage: Message = { role: "user", content };
    setChatMessages((prev) => [...prev, newMessage]);

    setIsGenerating(true);
    setPartialAssistantMessage("");

    try {
      const classNameForRequest = selectedClass === null ? "null" : selectedClass;
      const chatData = await sendChatRequest(content, classNameForRequest, currentChatSessionId);

      const assistantMsg =
        chatData.messages.length > 0
          ? chatData.messages[chatData.messages.length - 1]
          : null;

      if (!assistantMsg || assistantMsg.role !== "assistant") {
        setChatMessages(chatData.messages);
        setIsGenerating(false);

        // If brand new session
        if (!currentChatSessionId && chatData.chatSessionId) {
          setCurrentChatSessionId(chatData.chatSessionId);
          setChatSessions((prev) => [
            ...prev,
            {
              _id: chatData.chatSessionId,
              sessionName: "New Chat",
              messages: chatData.messages,
              assignedClass: chatData.assignedClass || null,
            },
          ]);
        } else {
          // Update existing session
          setChatSessions((prev) =>
            prev.map((session) =>
              session._id === chatData.chatSessionId
                ? {
                    ...session,
                    messages: chatData.messages,
                    assignedClass: chatData.assignedClass || null,
                  }
                : session
            )
          );
        }

        if (chatData.assignedClass !== undefined) {
          setSelectedClass(chatData.assignedClass || null);
        }
        return;
      }

      // Temporarily remove final assistant message for streaming
      const updated = [...chatData.messages];
      updated.pop();
      setChatMessages(updated);

      if (chatData.assignedClass !== undefined) {
        setSelectedClass(chatData.assignedClass || null);
      }

      const full = assistantMsg.content;
      let i = 0;

      const interval = setInterval(() => {
        i += 1;
        setPartialAssistantMessage(full.substring(0, i));
        if (i >= full.length) {
          clearInterval(interval);
          const finalMessages = [...updated, { ...assistantMsg, content: full }];
          setChatMessages(finalMessages);
          setIsGenerating(false);

          if (!currentChatSessionId && chatData.chatSessionId) {
            setCurrentChatSessionId(chatData.chatSessionId);
            setChatSessions((prev) => [
              ...prev,
              {
                _id: chatData.chatSessionId,
                sessionName: "New Chat",
                messages: finalMessages,
                assignedClass: chatData.assignedClass || null,
              },
            ]);
          } else {
            setChatSessions((prev) =>
              prev.map((session) =>
                session._id === chatData.chatSessionId
                  ? {
                      ...session,
                      messages: finalMessages,
                      assignedClass: chatData.assignedClass || null,
                    }
                  : session
              )
            );
          }
        }
      }, 10);
    } catch (error) {
      console.error(error);
      toast.error("Failed to send message");
      setIsGenerating(false);
    }
  };

  /* ------------------------------
     CREATE NEW CHAT
     ------------------------------ */
  const handleCreateNewChatSession = () => {
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

      setChatSessions((prev) => [
        ...prev,
        {
          ...data.chatSession,
          assignedClass: null,
        },
      ]);

      setCurrentChatSessionId(data.chatSession._id);
      setChatMessages([]);
      setSelectedClass(null);

      setIsNamingChat(false);
      setNewChatName("");
    } catch (err) {
      console.error(err);
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
      console.error(error);
      toast.error("Failed to delete chat session");
    }
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
      console.error(error);
      toast.error("Failed to delete all chat sessions");
    }
  };

  /* ------------------------------
     RENDER
     ------------------------------ */
  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        height: "100vh",
        gap: 3,
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <Box
        sx={{
          display: { md: "flex", xs: "none", sm: "none" },
          flex: 0.25,
          flexDirection: "column",
          left: 0,
          bottom: 0,
          boxShadow: "2px 0 5px rgba(0,0,0,0.8)",
          height: "100vh",
        }}
      >
        <Box
          sx={{
            display: "flex",
            width: "100%",
            height: "100%",
            bgcolor: "#004d5612",
            borderRadius: 0,
            flexDirection: "column",
            overflowY: "auto",
            padding: 0,
            margin: 0,
          }}
        >
          {/* Chats Section */}
          <List
            sx={{
              color: "white",
              mt: "64px",
            }}
            subheader={
              <ListSubheader
                component="div"
                id="chats-list-subheader"
                sx={{ bgcolor: "inherit", color: "white", fontSize: "1.2em", fontWeight: "bold" }}
              >
                <ChatBubbleIcon sx={{ mr: 1 }} />
                Chats
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
                      ":hover": {
                        bgcolor: "darkblue",
                      },
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
                      ":hover": {
                        bgcolor: red.A400,
                      },
                    }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            ) : (
              <ListItemButton onClick={handleCreateNewChatSession} sx={{ pl: 2 }}>
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
                    ".chat-list-item:hover &": {
                      opacity: 1,
                    },
                  }}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </ListItemButton>
            ))}
          </List>

          {/* Divider */}
          <Divider sx={{ backgroundColor: "white", my: 2 }} />

          {/* Classes Section */}
          <List
            sx={{
              color: "white",
            }}
            subheader={
              <ListSubheader
                component="div"
                id="classes-list-subheader"
                sx={{ bgcolor: "inherit", color: "white", fontSize: "1.2em", fontWeight: "bold" }}
              >
                <StyleIcon sx={{ mr: 1 }} />
                Classes
              </ListSubheader>
            }
          >
            <ListItemButton sx={{ pl: 2 }}>
              <ListItemIcon sx={{ color: "white" }}>
                <AddIcon />
              </ListItemIcon>
              <ListItemText primary="New Class" sx={{ color: "white" }} />
            </ListItemButton>

            {classes.map((cls) => (
              <ListItem key={cls._id} sx={{ pl: 3 }}>
                <ListItemText primary={cls.name} />
              </ListItem>
            ))}
          </List>
        </Box>
      </Box>

      {/* Main Chat Section */}
      <Box
        sx={{
          display: "flex",
          flex: { md: 0.75, xs: 1, sm: 1 },
          flexDirection: "column",
          height: "90vh",
          mt: 10,
          mr: 3,
        }}
      >
        {/* Header Section */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Class Selector */}
          <TextField
            id="class-select"
            select
            label="Select Class"
            value={selectedClass || "null"}
            onChange={handleClassChange}
            variant="outlined"
            sx={{
              "& .MuiSvgIcon-root": {
                color: "white",
              },
            }}
            InputProps={{
              sx: {
                color: "white",
              },
            }}
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
                        "&:hover": {
                          bgcolor: "#616161",
                        },
                      },
                      "&:hover": {
                        bgcolor: "#757575",
                      },
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
        </Box>

        {chatMessages.length === 0 && partialAssistantMessage === "" ? (
          // If no messages, show initial view
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
              How can StudyBuddy help?
            </Typography>

            {/* Input Container */}
            <Box
              sx={{
                width: "100%",
                maxWidth: 600,
                mb: 3,
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  borderRadius: 2,
                  backgroundColor: "rgb(17,27,39)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <input
                  ref={inputRef}
                  disabled={isGenerating}
                  type="text"
                  onKeyDown={handleKeyDown}
                  style={{
                    width: "100%",
                    backgroundColor: "transparent",
                    padding: "16px",
                    border: "none",
                    outline: "none",
                    color: "white",
                    fontSize: "18px",
                  }}
                />
                {
                  !isGenerating ? (
                    // Normal "Send" button
                    <IconButton onClick={handleSubmit} sx={{ color: "white", mx: 1 }}>
                      <IoMdSend />
                    </IconButton>
                  ) : (
                    // "Stop" button with a small square
                    <IconButton
                      onClick={handleStop}
                      sx={{ color: "white", mx: 1 }}
                    >
                      {/* A simple square icon (16x16) */}
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          backgroundColor: "white",
                        }}
                      />
                    </IconButton>
                  )
                }
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 2 }}>
              <Button variant="contained">Create Study Guide</Button>
              <Button variant="contained">Generate Notes</Button>
            </Box>
          </Box>
        ) : (
          // Normal chat view
          <>
            <Box
              sx={{
                width: "100%",
                flexGrow: 1,
                borderRadius: 3,
                mx: "auto",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
                scrollBehavior: "smooth",
                mb: 2,
              }}
            >
              {chatMessages.map((chat, index) => (
                <ChatItem key={index} content={chat.content} role={chat.role} citation={chat.citation} />
              ))}

              {/* If we are streaming partial text, show partial */}
              {isGenerating && partialAssistantMessage && (
                <ChatItem
                  content={partialAssistantMessage}
                  role="assistant"
                  citation={[]}
                />
              )}

              {/* Use loader ONLY */}
              {isGenerating && partialAssistantMessage === "" && (
                <Box sx={{ 
                  display: "flex", 
                  alignItems: "center", 
                  m: 1,
                  transform: "scale(0.25)",
                  transformOrigin: "left top" 
                  }}>
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
              <input
                ref={inputRef}
                disabled={isGenerating}
                type="text"
                onKeyDown={handleKeyDown}
                style={{
                  width: "100%",
                  backgroundColor: "transparent",
                  padding: "16px",
                  border: "none",
                  outline: "none",
                  color: "white",
                  fontSize: "18px",
                }}
              />

              {
                !isGenerating ? (
                  /* Normal "Send" button */
                  <IconButton onClick={handleSubmit} sx={{ color: "white", mx: 1 }}>
                    <IoMdSend />
                  </IconButton>
                ) : (
                  /* "Stop" button (square icon) */
                  <IconButton
                    onClick={handleStop}
                    sx={{ color: "white", mx: 1 }}
                  >
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        backgroundColor: "white",
                      }}
                    />
                  </IconButton>
                )
              }
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default Chat;
