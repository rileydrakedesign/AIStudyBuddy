import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Avatar,
  Typography,
  Button,
  IconButton,
  Select,
  MenuItem,
  SelectChangeEvent,
  List,
  ListItem,
  ListItemText,
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

type Message = {
  role: "user" | "assistant";
  content: string;
  citation?: { href: string | null; text: string }[];
};

type ChatSession = {
  _id: string;
  sessionName: string;
  messages: Message[];
};

type ClassOption = {
  name: string;
  _id: string;
};

const Chat = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const auth = useAuth();
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [isNamingChat, setIsNamingChat] = useState(false);
  const [newChatName, setNewChatName] = useState('');

  // Fetch user's classes
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
          setSelectedClass(storedClass); // Restore selected class
        }
      } catch (error) {
        console.error("Error fetching classes", error);
      }
    };

    if (auth?.isLoggedIn) {
      fetchClasses();
    }
  }, [auth]);

  // Save selected class to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("selectedClass", selectedClass || "null");
  }, [selectedClass]);

  // Fetch chat sessions on load
  useEffect(() => {
    if (auth?.isLoggedIn && auth.user) {
      toast.loading("Loading Chat Sessions", { id: "loadchatsessions" });
      getUserChatSessions()
        .then((data) => {
          setChatSessions(data.chatSessions);
          if (data.chatSessions.length > 0) {
            // Set the first chat session as current by default
            setCurrentChatSessionId(data.chatSessions[0]._id);
            setChatMessages(data.chatSessions[0].messages);
          }
          toast.success("Successfully loaded chat sessions", { id: "loadchatsessions" });
        })
        .catch((err) => {
          console.error(err);
          toast.error("Loading Chat Sessions Failed", { id: "loadchatsessions" });
        });
    }
  }, [auth]);

  // Redirect to login if not logged in
  useEffect(() => {
    if (!auth?.user) {
      return navigate("/login");
    }
  }, [auth]);

  // Handle class selection change
  const handleClassChange = (event: SelectChangeEvent<string>) => {
    const selectedClassName = event.target.value === "null" ? null : event.target.value;
    setSelectedClass(selectedClassName);
  };

  const handleSubmit = async () => {
    const content = inputRef.current?.value as string;
    if (inputRef && inputRef.current) {
      inputRef.current.value = "";
    }
    const newMessage: Message = { role: "user", content };
    setChatMessages((prev) => [...prev, newMessage]);

    try {
      const chatData = await sendChatRequest(content, selectedClass, currentChatSessionId);
      // Update chat messages and current chat session ID if necessary
      setChatMessages(chatData.messages);
      if (!currentChatSessionId && chatData.chatSessionId) {
        setCurrentChatSessionId(chatData.chatSessionId);
        // Add the new chat session to chatSessions
        setChatSessions((prev) => [
          ...prev,
          {
            _id: chatData.chatSessionId,
            sessionName: "New Chat",
            messages: chatData.messages,
          },
        ]);
      } else {
        // Update the messages in the chatSessions array
        setChatSessions((prev) =>
          prev.map((session) =>
            session._id === chatData.chatSessionId
              ? { ...session, messages: chatData.messages }
              : session
          )
        );
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to send message");
    }
  };

  const handleCreateNewChatSession = () => {
    setIsNamingChat(true);
    setNewChatName('');
  };

  const handleSubmitNewChatName = async () => {
    if (newChatName.trim() === '') {
      toast.error('Please enter a chat name');
      return;
    }
    try {
      const data = await createChatSession(newChatName.trim());
      setChatSessions((prev) => [...prev, data.chatSession]);
      setCurrentChatSessionId(data.chatSession._id);
      setChatMessages([]);
      setIsNamingChat(false);
      setNewChatName('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to create new chat session');
    }
  };

  const handleCancelNewChat = () => {
    setIsNamingChat(false);
    setNewChatName('');
  };

  const handleSelectChatSession = (chatSessionId: string) => {
    const selectedSession = chatSessions.find((session) => session._id === chatSessionId);
    if (selectedSession) {
      setCurrentChatSessionId(chatSessionId);
      setChatMessages(selectedSession.messages);
    }
  };

  const handleDeleteChatSession = async (chatSessionId: string) => {
    try {
      await deleteChatSession(chatSessionId);
      setChatSessions((prev) => prev.filter((session) => session._id !== chatSessionId));
      if (currentChatSessionId === chatSessionId) {
        // If the deleted session was the current one, reset
        if (chatSessions.length > 0) {
          const nextSession = chatSessions[0];
          setCurrentChatSessionId(nextSession._id);
          setChatMessages(nextSession.messages);
        } else {
          setCurrentChatSessionId(null);
          setChatMessages([]);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete chat session");
    }
  };

  const handleDeleteAllChatSessions = async () => {
    try {
      await deleteAllChatSessions();
      setChatSessions([]);
      setCurrentChatSessionId(null);
      setChatMessages([]);
      toast.success("All chat sessions deleted");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete all chat sessions");
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flex: 1,
        width: "100%",
        height: "100%",
        mt: 3,
        gap: 3,
      }}
    >
      {/* Sidebar */}
      <Box
        sx={{
          display: { md: "flex", xs: "none", sm: "none" },
          flex: 0.2,
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            display: "flex",
            width: "100%",
            height: "60vh",
            bgcolor: "rgb(17,29,39)",
            borderRadius: 5,
            flexDirection: "column",
            mx: 3,
          }}
        >
          <Avatar
            sx={{
              mx: "auto",
              my: 2,
              bgcolor: "white",
              color: "black",
              fontWeight: 700,
            }}
          >
            {auth?.user?.name[0]}
            {auth?.user?.name.split(" ")[1][0]}
          </Avatar>
          <Typography sx={{ mx: "auto", fontFamily: "work sans" }}>
            You are talking to a ChatBOT
          </Typography>
          <Typography sx={{ mx: "auto", fontFamily: "work sans", my: 4, p: 3 }}>
            Prototype AI tutor application
          </Typography>
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
                  color: "black"
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
            <Button
              onClick={handleCreateNewChatSession}
              sx={{
                width: "200px",
                my: "auto",
                color: "white",
                fontWeight: "700",
                borderRadius: 3,
                mx: "auto",
                bgcolor: "blue",
                ":hover": {
                  bgcolor: "darkblue",
                },
              }}
            >
              New Chat
            </Button>
          )}
          <List sx={{ color: "white", overflowY: "auto", mt: 2 }}>
            {chatSessions.map((session) => (
              <ListItem
                button
                key={session._id}
                selected={session._id === currentChatSessionId}
                onClick={() => handleSelectChatSession(session._id)}
              >
                <ListItemText primary={session.sessionName} />
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChatSession(session._id);
                  }}
                  sx={{ color: "red" }}
                >
                  Delete
                </IconButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Box>

      {/* Main Chat Section */}
      <Box
        sx={{
          display: "flex",
          flex: { md: 0.8, xs: 1, sm: 1 },
          flexDirection: "column",
          px: 3,
        }}
      >
        {/* Header Section */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography
            sx={{
              fontSize: "40px",
              color: "white",
              mb: 2,
              fontWeight: "600",
            }}
          >
            AI Study Buddy
          </Typography>
          <Select
            value={selectedClass || "null"}
            onChange={handleClassChange}
            displayEmpty
            inputProps={{ "aria-label": "Select Class" }}
            sx={{
              backgroundColor: "white",
              color: "black",
              minWidth: "150px",
              mx: 2,
              borderRadius: 2,
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  bgcolor: "white",
                  "& .MuiMenuItem-root": {
                    color: "black",
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
          </Select>
        </Box>

        {/* Chat Messages */}
        <Box
          sx={{
            width: "100%",
            height: "60vh",
            borderRadius: 3,
            mx: "auto",
            display: "flex",
            flexDirection: "column",
            overflow: "scroll",
            overflowX: "hidden",
            overflowY: "auto",
            scrollBehavior: "smooth",
          }}
        >
          {chatMessages.map((chat, index) => (
            <ChatItem
              key={index}
              content={chat.content}
              role={chat.role}
              citation={chat.citation}
            />
          ))}
        </Box>

        {/* Input Section */}
        <div
          style={{
            width: "100%",
            borderRadius: 8,
            backgroundColor: "rgb(17,27,39)",
            display: "flex",
            margin: "auto",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            style={{
              width: "100%",
              backgroundColor: "transparent",
              padding: "30px",
              border: "none",
              outline: "none",
              color: "white",
              fontSize: "20px",
            }}
          />
          <IconButton onClick={handleSubmit} sx={{ color: "white", mx: 1 }}>
            <IoMdSend />
          </IconButton>
        </div>
      </Box>
    </Box>
  );
};

export default Chat;
