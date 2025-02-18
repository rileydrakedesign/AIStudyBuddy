import React, { useEffect, useRef, useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { IoMdSend } from "react-icons/io";
import Loader from "../ui/loader";
import ChatItem from "../chat/chatItem";
import toast from "react-hot-toast";
import { getDocumentFile, sendChatRequest } from "../../helpers/api-communicators";

// PDF viewer
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

// Types
type Message = {
  role: "user" | "assistant";
  content: string;
  citation?: { href: string | null; text: string }[];
};

type Chunk = {
  chunkNumber: number;
  text: string;
  pageNumber?: number;
};

interface DocumentChatProps {
  docId: string; // Which document we’re chatting with
  onClose: () => void; // Callback to exit doc-chat mode
}

const DocumentChat: React.FC<DocumentChatProps> = ({ docId, onClose }) => {
  // If we haven't started a conversation yet, docSessionId is null
  // After the first message, the server returns an ephemeral session ID
  const [docSessionId, setDocSessionId] = useState<string | null>(null);

  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialAssistantMessage, setPartialAssistantMessage] = useState("");

  const [numPages, setNumPages] = useState<number | null>(null);
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // 1) Fetch the doc’s S3 URL
  useEffect(() => {
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

  // 2) Chat scrolling logic
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
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, partialAssistantMessage, isAtBottom]);

  // 3) Send a message
  const handleSend = async () => {
    if (!inputRef.current || !inputRef.current.value.trim()) return;

    const userText = inputRef.current.value.trim();
    inputRef.current.value = "";

    // Immediately add the user message locally
    const newMessage: Message = { role: "user", content: userText };
    setMessages((prev) => [...prev, newMessage]);

    setIsGenerating(true);
    setPartialAssistantMessage("");

    try {
      // If docSessionId is null, the server will create a new ephemeral doc session
      // If docSessionId is not null, the server re-uses it (persisting the chat).

      // Instead of passing docSessionId, do this:
      const sessionIdForRequest = docSessionId === null ? "null" : docSessionId;

      const chatData = await sendChatRequest(
        userText,
        "null",         // class_name
        sessionIdForRequest,   // pass the current ephemeral session ID, or null
        docId,          // doc-based
        true            // ephemeral
      );

      // If the server created a new ephemeral session, store its ID
      if (!docSessionId && chatData.chatSessionId) {
        setDocSessionId(chatData.chatSessionId);
      }

      setChunks(chatData.chunks || []);

      // The final assistant message in the returned array
      const assistantMsg =
        chatData.messages.length > 0
          ? chatData.messages[chatData.messages.length - 1]
          : null;

      if (!assistantMsg || assistantMsg.role !== "assistant") {
        // If no assistant message, just store entire array
        setMessages(chatData.messages);
        setIsGenerating(false);
        return;
      }

      // Temporarily remove final assistant message for typewriter effect
      const updated = [...chatData.messages];
      updated.pop();

      setMessages(updated);

      const fullText = assistantMsg.content;
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setPartialAssistantMessage(fullText.substring(0, i));
        if (i >= fullText.length) {
          clearInterval(interval);
          const final = [...updated, { ...assistantMsg, content: fullText }];
          setMessages(final);
          setPartialAssistantMessage("");
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
    setPartialAssistantMessage("");
  };

  // 4) Citation click => highlight PDF text
  const handleCitationClick = (chunkNumber: number) => {
    const chunk = chunks.find((c) => c.chunkNumber === chunkNumber);
    if (!chunk) {
      toast.error(`No chunk found for bracket reference [${chunkNumber}]`);
      return;
    }
    if (!chunk.pageNumber) {
      toast.error(`No page number found for chunk [${chunkNumber}]`);
      return;
    }

    setHighlightedPage(chunk.pageNumber);
    setHighlightedText(chunk.text);

    const targetId = `pdf-page-${chunk.pageNumber}`;
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // 5) React-PDF callbacks
  const onDocumentLoadSuccess = (pdf: any) => {
    setNumPages(pdf.numPages);
  };

  const customTextRenderer = (pageIndex: number) => (textItem: { str: string }): string => {
    const { str } = textItem;
    if (highlightedPage === pageIndex && highlightedText) {
      const parts = str.split(highlightedText);
      if (parts.length > 1) {
        return parts.join(
          `<mark style="background-color: yellow;">${highlightedText}</mark>`
        );
      }
    }
    return str;
  };

  return (
    <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left side: PDF viewer */}
      <Box sx={{ flex: 1, borderRight: "1px solid #ccc", overflowY: "auto" }}>
        {docUrl ? (
          <div style={{ width: "100%", height: "100%", padding: "1rem" }}>
            <Document file={docUrl} onLoadSuccess={onDocumentLoadSuccess}>
              {numPages &&
                Array.from({ length: numPages }, (_, i) => {
                  const pageNumber = i + 1;
                  return (
                    <div
                      key={`page_container_${pageNumber}`}
                      id={`pdf-page-${pageNumber}`}
                      style={{ marginBottom: "2rem" }}
                    >
                      <Page
                        pageNumber={pageNumber}
                        width={600}
                        customTextRenderer={customTextRenderer(pageNumber)}
                      />
                    </div>
                  );
                })}
            </Document>
          </div>
        ) : (
          <Typography variant="body1" sx={{ m: 2, color: "white" }}>
            Loading document...
          </Typography>
        )}
      </Box>

      {/* Right side: chat area */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <Box
          sx={{
            p: 1,
            borderBottom: "1px solid #444",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="h6" sx={{ color: "white" }}>
            Document Chat
          </Typography>
          <button onClick={onClose} style={{ padding: "6px 12px", cursor: "pointer" }}>
            Back
          </button>
        </Box>

        {/* Messages */}
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
              onCitationClick={handleCitationClick}
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

        {/* Input section */}
        <Box
          sx={{
            p: 2,
            display: "flex",
            borderTop: "1px solid #444",
            backgroundColor: "#1d2d44",
          }}
        >
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
