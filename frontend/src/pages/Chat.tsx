import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Avatar, Typography, Button, IconButton, Select,
  MenuItem, SelectChangeEvent } from "@mui/material";
import red from "@mui/material/colors/red";
import { useAuth } from "../context/authContext";
import ChatItem from "../components/chat/chatItem";
import { IoMdSend } from "react-icons/io";
import { useNavigate } from "react-router-dom";
import {
  deleteUserChats,
  getUserChats,
  sendChatRequest,
  getUserClasses,
} from "../helpers/api-communicators";
import toast from "react-hot-toast";
type Message = {
  role: "user" | "assistant";
  content: string;
  citation?: { href: string | null; text: string }[];
};

type ClassOption = {
  name: string;
  _id: string;
};


const Chat = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const auth = useAuth();
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  // Fetch user's classes
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { classes } = await getUserClasses();
        setClasses(classes);

        const storedClass = localStorage.getItem("selectedClass");
        if (storedClass === "null") {
          setSelectedClass(null);
        } else if (storedClass && classes.some((cls: ClassOption) => cls.name === storedClass)) {
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

  // Fetch chat messages on load
  useLayoutEffect(() => {
    if (auth?.isLoggedIn && auth.user) {
      toast.loading("Loading Chats", { id: "loadchats" });
      getUserChats()
        .then((data) => {
          setChatMessages([...data.chats]);
          toast.success("Successfully loaded chats", { id: "loadchats" });
        })
        .catch((err) => {
          console.error(err);
          toast.error("Loading Failed", { id: "loadchats" });
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
    setSelectedClass(selectedClassName); // Update the state
  };
  
  const handleSubmit = async () => {
    const content = inputRef.current?.value as string;
    if (inputRef && inputRef.current) {
      inputRef.current.value = "";
    }
    const newMessage: Message = { role: "user", content };
    setChatMessages((prev) => [...prev, newMessage]);
    const chatData = await sendChatRequest(content, selectedClass);
    setChatMessages([...chatData.chats]);
    //sends post request to chat/new that is defined in the chat routes file and calls the generateChatCompletion func
  };
  const handleDeleteChats = async () => {
    try {
      toast.loading("Deleting Chats", { id: "deletechats" });
      await deleteUserChats();
      setChatMessages([]);
      toast.success("Deleted Chats Successfully", { id: "deletechats" });
    } catch (error) {
      console.log(error);
      toast.error("Deleting chats failed", { id: "deletechats" });
    }
  };
  useLayoutEffect(() => {
    if (auth?.isLoggedIn && auth.user) {
      toast.loading("Loading Chats", { id: "loadchats" });
      getUserChats()
        .then((data) => {
          setChatMessages([...data.chats]);
          toast.success("Successfully loaded chats", { id: "loadchats" });
        })
        .catch((err) => {
          console.log(err);
          toast.error("Loading Failed", { id: "loadchats" });
        });
    }
  }, [auth]);
  useEffect(() => {
    if (!auth?.user) {
      return navigate("/login");
    }
  }, [auth]);
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
          <Button
            onClick={handleDeleteChats}
            sx={{
              width: "200px",
              my: "auto",
              color: "white",
              fontWeight: "700",
              borderRadius: 3,
              mx: "auto",
              bgcolor: red[300],
              ":hover": {
                bgcolor: red.A400,
              },
            }}
          >
            Clear Conversation
          </Button>
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
                  bgcolor: "white", // Background color of the menu
                  "& .MuiMenuItem-root": {
                    color: "black", // Text color of menu items
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