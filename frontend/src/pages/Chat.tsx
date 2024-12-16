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
import ChatIcon from '@mui/icons-material/Chat';
import ClassIcon from '@mui/icons-material/Book';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { styled } from '@mui/material/styles';




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
  const handleClassChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
            padding: 0, // Ensure no padding pushes content
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
                <ListItemIcon sx={{ color: 'white' }}>
                  <AddIcon />
                </ListItemIcon>
                <ListItemText primary="New Chat" sx={{ color: 'white' }} />
              </ListItemButton>
            )}

            {chatSessions.map((session) => (
              <ListItemButton
                key={session._id}
                className="chat-list-item"
                selected={session._id === currentChatSessionId}
                onClick={() => handleSelectChatSession(session._id)}
                sx={{ pl: 2 }}
              >
                <ListItemIcon sx={{ color: "white" }}>
                  <ChatIcon />
                </ListItemIcon>
                <ListItemText primary={session.sessionName} />
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChatSession(session._id);
                  }}
                  sx={{ 
                    color: "red",
                    opacity: 0,
                    transition: 'opacity 0.3s',
                    '.chat-list-item:hover &': {
                      opacity: 1,
                    },
                   }}
                >
                  <DeleteOutlineIcon />
                </IconButton>
            </ListItemButton>
            ))}
          </List>

          {/* Divider between sections */}
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
                Classes
              </ListSubheader>
            }
          >
            {/* New Class Button */}
            <ListItemButton /*onClick={handleCreateNewClass}*/ sx={{ pl: 2 }}>
              <ListItemIcon sx={{ color: 'white' }}>
                <AddIcon />
              </ListItemIcon>
              <ListItemText primary="New Class" sx={{ color: 'white' }} />
            </ListItemButton>

            {classes.map((cls) => (
              <ListItem key={cls._id} sx={{ pl: 2 }}>
                <ListItemIcon sx={{ color: "white" }}>
                  <ClassIcon />
                </ListItemIcon>
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
          //px: 3,
          height: '90vh',
          //ml: { md: '300px', xs: 0 },
          padding: 0, // Ensure no padding pushes content
          mt: 8,
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
              '& .MuiSvgIcon-root': {
                color: 'white',
              },
            }}
            InputProps={{
              sx: {
                color: 'white', // Text color of the selected value
              },
            }}
            SelectProps={{
              MenuProps: {
                PaperProps: {
                  sx: {
                    bgcolor: '#424242',
                    '& .MuiMenuItem-root': {
                      color: 'white',
                      '&.Mui-selected': {
                        bgcolor: '#616161',
                        color: 'white',
                        '&:hover': {
                          bgcolor: '#616161',
                        },
                      },
                      '&:hover': {
                        bgcolor: '#757575',
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


        {chatMessages.length === 0 ? (
          // **Render the initial view when there are no messages**
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: 1,
              textAlign: 'center',
            }}
          >
            {/* Title */}
            <Typography variant="h4" sx={{ mb: 3 }}>
              How can StudyBuddy help?
            </Typography>

            {/* Text Field */}
            <Box
              sx={{
                width: '100%',
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
                  type="text"
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
                <IconButton onClick={handleSubmit} sx={{ color: "white", mx: 1 }}>
                  <IoMdSend />
                </IconButton>
              </Box>
            </Box>

            {/* Buttons */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="contained">Create Study Guide</Button>
              <Button variant="contained">Generate Notes</Button>
              {/* Add more buttons as desired */}
            </Box>
          </Box>
        ) : (
          // **Render the normal chat view when there are messages**
          <>
            {/* Chat Messages */}
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
                <ChatItem
                  key={index}
                  content={chat.content}
                  role={chat.role}
                  citation={chat.citation}
                />
              ))}
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
                type="text"
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
              <IconButton onClick={handleSubmit} sx={{ color: "white", mx: 1 }}>
                <IoMdSend />
              </IconButton>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default Chat;
