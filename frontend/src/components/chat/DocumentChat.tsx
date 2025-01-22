import React, { useEffect, useRef, useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { IoMdSend } from "react-icons/io";
import Loader from "../ui/loader";
import ChatItem from "../chat/chatItem";
import toast from "react-hot-toast";
import { getDocumentFile, sendChatRequest } from "../../helpers/api-communicators";

// 1) Import react-pdf components
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// 2) Specify the worker, e.g., in public folder or from the CDN
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
  docId: string; // which document we’re chatting with
  onClose: () => void; // callback to exit doc-chat mode
}

const DocumentChat: React.FC<DocumentChatProps> = ({ docId, onClose }) => {
  const [docUrl, setDocUrl] = useState<string | null>(null); // S3 pre-signed URL
  const [messages, setMessages] = useState<Message[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialAssistantMessage, setPartialAssistantMessage] = useState("");

  // We'll only track the total number of pages for "all pages" rendering.
  const [numPages, setNumPages] = useState<number | null>(null);

  // NEW: For highlighting
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  // Refs for chat scrolling
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /* ------------------------------
     1) Fetch the doc’s S3 URL
     ------------------------------ */
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

  /* ------------------------------
     2) Chat scrolling logic
     ------------------------------ */
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const nearBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsAtBottom(nearBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, partialAssistantMessage, isAtBottom]);

  /* ------------------------------
     3) Sending a message
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
      const chatData = await sendChatRequest(
        userText,
        "null", // class_name placeholder
        "null", // chatSessionId placeholder
        docId
      );

      // Store chunk data
      setChunks(chatData.chunks || []);

      // The final assistant message from the returned array
      const assistantMsg =
        chatData.messages.length > 0
          ? chatData.messages[chatData.messages.length - 1]
          : null;

      if (!assistantMsg || assistantMsg.role !== "assistant") {
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

  /* ------------------------------
     4) Citation click callback
     ------------------------------ */
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
    // Set the highlight information for the page and text
    setHighlightedPage(chunk.pageNumber);
    setHighlightedText(chunk.text);

    // Scroll to that page container
    const targetId = `pdf-page-${chunk.pageNumber}`;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  /* ------------------------------
     5) React-PDF callbacks
     ------------------------------ */
  const onDocumentLoadSuccess = (pdf: any) => {
    setNumPages(pdf.numPages);
  };

  /**
   * customTextRenderer returns a string that contains HTML markup.
   * Since react-pdf's customTextRenderer expects a string,
   * we return an HTML string that includes <mark> tags around the highlighted text.
   */
  const customTextRenderer = (pageIndex: number) => (
    textItem: { str: string }
  ): string => {
    const { str } = textItem;
    if (highlightedPage === pageIndex && highlightedText) {
      const parts = str.split(highlightedText);
      if (parts.length > 1) {
        // Join the parts inserting a <mark> tag for each occurrence.
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
      <Box sx={{ flex: "1", borderRight: "1px solid #ccc", overflowY: "auto" }}>
        {docUrl ? (
          <div style={{ width: "100%", height: "100%", padding: "1rem" }}>
            <Document file={docUrl} onLoadSuccess={onDocumentLoadSuccess}>
              {/* Show all pages once numPages is known */}
              {numPages &&
                Array.from({ length: numPages }, (_, index) => {
                  const pageNumber = index + 1;
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
      <Box sx={{ flex: "1", display: "flex", flexDirection: "column" }}>
        {/* Top toolbar or "Back" button */}
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
          <button
            onClick={onClose}
            style={{ padding: "6px 12px", cursor: "pointer" }}
          >
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

        {/* Input bar */}
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
