// DocumentChat.tsx

import React, { useEffect, useRef, useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { IoMdSend } from "react-icons/io";
import Loader from "../ui/loader";
import ChatItem from "../chat/chatItem";
import toast from "react-hot-toast";
import { getDocumentFile, sendChatRequest } from "../../helpers/api-communicators";

// Types
type Message = {
  role: "user" | "assistant";
  content: string;
  citation?: { href: string | null; text: string }[];
};

type Chunk = {
  chunkNumber: number;
  text: string;
};

// Props for DocumentChat
interface DocumentChatProps {
  docId: string;                  // which document we’re chatting with
  onClose: () => void;           // callback to exit doc-chat mode
}

const DocumentChat: React.FC<DocumentChatProps> = ({ docId, onClose }) => {
  const [docUrl, setDocUrl] = useState<string | null>(null);  // S3 pre-signed URL
  const [messages, setMessages] = useState<Message[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialAssistantMessage, setPartialAssistantMessage] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /* ------------------------------
     Fetch the doc’s S3 URL
     ------------------------------ */
  useEffect(() => {
    // Retrieve the S3 pre-signed URL for docId
    getDocumentFile(docId)
      .then((res) => {
        if (res.url) {
          setDocUrl(res.url);
        }
      })
      .catch((err) => {
        console.error("Error retrieving doc URL:", err);
        toast.error("Could not retrieve document link");
      });
  }, [docId]);

  /* ------------------------------
     Chat scrolling logic
     ------------------------------ */
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsAtBottom(isNearBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // auto-scroll if at bottom
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, partialAssistantMessage, isAtBottom]);

  /* ------------------------------
     Sending a message
     ------------------------------ */
  const handleSend = async () => {
    if (!inputRef.current || !inputRef.current.value.trim()) return;

    const userText = inputRef.current.value.trim();
    inputRef.current.value = "";

    const newMessage: Message = { role: "user", content: userText };
    setMessages((prev) => [...prev, newMessage]);

    setIsGenerating(true);
    setPartialAssistantMessage("");

    try {
      // Pass docId to the existing chat endpoint
      const chatData = await sendChatRequest(
        userText,
        "null", 
        "null",
        docId       
      );

      setChunks(chatData.chunks || []);

      // The final assistant message:
      const assistantMsg =
        chatData.messages.length > 0
          ? chatData.messages[chatData.messages.length - 1]
          : null;

      if (!assistantMsg || assistantMsg.role !== "assistant") {
        // No final streaming message
        setMessages(chatData.messages);
        setIsGenerating(false);
        return;
      }

      // Temporarily remove final message for streaming
      const updated = [...chatData.messages];
      updated.pop();
      setMessages(updated);

      // Stream text
      const full = assistantMsg.content;
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setPartialAssistantMessage(full.substring(0, i));
        if (i >= full.length) {
          clearInterval(interval);
          const final = [...updated, { ...assistantMsg, content: full }];
          setMessages(final);
          setIsGenerating(false);
        }
      }, 20);
    } catch (err) {
      console.error("Error sending doc-based chat message:", err);
      toast.error("Failed to send message");
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !isGenerating) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    setIsGenerating(false);
  };

  return (
    <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left side: doc viewer */}
      <Box sx={{ flex: "1", borderRight: "1px solid #ccc" }}>
        {docUrl ? (
          <iframe
            src={docUrl}
            title="Document Viewer"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        ) : (
          <Typography variant="body1" sx={{ m: 2, color: "white" }}>
            Loading document...
          </Typography>
        )}
      </Box>

      {/* Right side: chat area */}
      <Box sx={{ flex: "1", display: "flex", flexDirection: "column" }}>
        {/* Top toolbar or "Back" button */}
        <Box sx={{ p: 1, borderBottom: "1px solid #444", display: "flex", justifyContent: "space-between" }}>
          <Typography variant="h6" sx={{ color: "white" }}>
            Document Chat
          </Typography>
          <button onClick={onClose} style={{ padding: "6px 12px", cursor: "pointer" }}>
            Back
          </button>
        </Box>

        {/* Chat messages */}
        <Box
          ref={chatContainerRef}
          sx={{ flexGrow: 1, overflowY: "auto", p: 2, backgroundColor: "#2E2E2E" }}
        >
          {messages.map((msg, index) => (
            <ChatItem
              key={index}
              content={msg.content}
              role={msg.role}
              citation={msg.citation}
              chunks={chunks}
            />
          ))}

          {isGenerating && partialAssistantMessage && (
            <ChatItem
              content={partialAssistantMessage}
              role="assistant"
              citation={[]}
              chunks={chunks}
            />
          )}

          {isGenerating && partialAssistantMessage === "" && (
            <Box sx={{ display: "flex", alignItems: "center", m: 1 }}>
              <Loader />
            </Box>
          )}

          <div ref={messagesEndRef} />
        </Box>

        {/* Input bar */}
        <Box sx={{ p: 2, display: "flex", borderTop: "1px solid #444", backgroundColor: "#1d2d44" }}>
          <input
            ref={inputRef}
            type="text"
            disabled={isGenerating}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              color: "white",
              fontSize: "16px",
            }}
          />
          {!isGenerating ? (
            <IconButton onClick={handleSend} sx={{ color: "white", ml: 1 }}>
              <IoMdSend />
            </IconButton>
          ) : (
            <IconButton onClick={handleStop} sx={{ color: "white", ml: 1 }}>
              <Box sx={{ width: 16, height: 16, backgroundColor: "white" }} />
            </IconButton>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default DocumentChat;
