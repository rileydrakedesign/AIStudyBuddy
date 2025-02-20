import React, { useEffect, useRef, useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { IoMdSend } from "react-icons/io";
import Loader from "../ui/loader";
import ChatItem from "../chat/chatItem";
import toast from "react-hot-toast";
import { getDocumentFile, sendChatRequest } from "../../helpers/api-communicators";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

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
  docId: string;
  onClose: () => void;
}

const DocumentChat: React.FC<DocumentChatProps> = ({ docId, onClose }) => {
  const [docSessionId, setDocSessionId] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialAssistantMessage, setPartialAssistantMessage] = useState("");

  // PDF
  const [numPages, setNumPages] = useState<number | null>(null);

  // NEW: how many pages to show at once
  const [visiblePagesCount, setVisiblePagesCount] = useState(3);

  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  // Refs for chat scrolling
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // PDF container ref for lazy loading
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);

  /* ------------------------------
     1) Fetch S3 URL for doc
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
     2) Chat scrolling
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
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, partialAssistantMessage, isAtBottom]);

  /* ------------------------------
     PDF infinite scroll
     ------------------------------ */
  useEffect(() => {
    const pdfEl = pdfContainerRef.current;
    if (!pdfEl) return;

    const handlePDFScroll = () => {
      if (!numPages) return;
      const { scrollTop, scrollHeight, clientHeight } = pdfEl;
      // If user is near bottom and we have more pages to load
      if (scrollHeight - scrollTop - clientHeight < 300) {
        // load next chunk
        setVisiblePagesCount((prev) => {
          // e.g. load 3 more pages at a time
          const nextVal = prev + 3;
          return nextVal > numPages ? numPages : nextVal;
        });
      }
    };

    pdfEl.addEventListener("scroll", handlePDFScroll);
    return () => pdfEl.removeEventListener("scroll", handlePDFScroll);
  }, [numPages]);

  /* ------------------------------
     3) Send a message
     ------------------------------ */
  const handleSend = async () => {
    if (!inputRef.current || !inputRef.current.value.trim()) return;
    const userText = inputRef.current.value.trim();
    inputRef.current.value = "";

    // Immediately add user message
    const newMessage: Message = { role: "user", content: userText };
    setMessages((prev) => [...prev, newMessage]);

    setIsGenerating(true);
    setPartialAssistantMessage("");

    try {
      const sessionIdForRequest = docSessionId === null ? "null" : docSessionId;
      const chatData = await sendChatRequest(
        userText,
        "null",
        sessionIdForRequest,
        docId,
        true
      );

      // If no docSessionId yet, store the newly created ephemeral ID
      if (!docSessionId && chatData.chatSessionId) {
        setDocSessionId(chatData.chatSessionId);
      }

      setChunks(chatData.chunks || []);

      const assistantMsg =
        chatData.messages.length > 0
          ? chatData.messages[chatData.messages.length - 1]
          : null;

      if (!assistantMsg || assistantMsg.role !== "assistant") {
        setMessages(chatData.messages);
        setIsGenerating(false);
        return;
      }

      // "Stream" the final message
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

  /* ------------------------------
     4) Citation click => highlight text + jump to page
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

    setHighlightedPage(chunk.pageNumber);
    setHighlightedText(chunk.text);

    // If the citation page is beyond what we currently have rendered, expand
    if (numPages && chunk.pageNumber > visiblePagesCount) {
      setVisiblePagesCount((prev) => {
        const needed = chunk.pageNumber || 1;
        return needed > numPages ? numPages : needed;
      });
    }

    // After we ensure it's rendered, let's scroll to it
    const targetId = `pdf-page-${chunk.pageNumber}`;
    setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 200);
  };

  /* ------------------------------
     5) React-PDF callbacks
     ------------------------------ */
  const onDocumentLoadSuccess = (pdf: any) => {
    setNumPages(pdf.numPages);
  };

  /**
   * Renders text, optionally highlighting the chunk.
   */
  const customTextRenderer =
    (pageIndex: number) => (textItem: { str: string }): string => {
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
      <Box
        sx={{ flex: 1, borderRight: "1px solid #ccc", overflowY: "auto" }}
        ref={pdfContainerRef} // for infinite scroll
      >
        {docUrl ? (
          <div style={{ width: "100%", height: "100%", padding: "1rem" }}>
            <Document file={docUrl} onLoadSuccess={onDocumentLoadSuccess}>
              {numPages &&
                // We'll only render up to visiblePagesCount
                Array.from({ length: visiblePagesCount }, (_, i) => {
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
              {numPages && visiblePagesCount < numPages && (
                <Typography variant="body2" sx={{ color: "white" }}>
                  Scroll down to load more pages...
                </Typography>
              )}
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
