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

type EphemeralChunk = {
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

  // All messages for this document chat
  const [messages, setMessages] = useState<Message[]>([]);
  // Ephemeral chunks for the newest answer (if needed)
  const [ephemeralChunks, setEphemeralChunks] = useState<EphemeralChunk[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [partialAssistantMessage, setPartialAssistantMessage] = useState("");

  // PDF / paging
  const [numPages, setNumPages] = useState<number | null>(null);

  // The central page in view
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Visible range for lazy loading
  const [visibleStartPage, setVisibleStartPage] = useState(1);
  const [visibleEndPage, setVisibleEndPage] = useState(3);

  // For highlighting in PDF
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  // Refs
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /* ------------------------------
     AUTO-RESIZE & CURSOR HANDLERS
     ------------------------------ */
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = "auto";
    const maxHeight = 150; // maximum height in pixels
    target.style.height = Math.min(target.scrollHeight, maxHeight) + "px";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    setTimeout(() => {
      const target = e.currentTarget;
      const length = target.value.length;
      target.setSelectionRange(length, length);
    }, 0);
  };

  /* ------------------------------
     1) Fetch Document URL
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
     2) Chat Scrolling
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
     3) Track PDF Scroll => currentPage
         Then set visibleStartPage/visibleEndPage
     ------------------------------ */

  // -- Remove old forward/back "infinite scroll" code --
  // useEffect(() => { ... }, []);
  // useEffect(() => { ... }, []);

  // Instead, dynamically compute currentPage based on scroll:
  useEffect(() => {
    const pdfEl = pdfContainerRef.current;
    if (!pdfEl || !numPages) return;

    const handlePDFScroll = () => {
      const containerRect = pdfEl.getBoundingClientRect();
      const pageDivs = pdfEl.querySelectorAll(".pdf-page-container");
      let newCurrent = currentPage;
      let minDistance = Infinity;

      pageDivs.forEach((div) => {
        const rect = div.getBoundingClientRect();
        // distance from container's vertical center
        const dist = Math.abs(
          rect.top - (containerRect.top + containerRect.height / 2)
        );
        if (dist < minDistance) {
          minDistance = dist;
          const pageNum = parseInt(
            div.getAttribute("data-page-number") || "1",
            10
          );
          newCurrent = pageNum;
        }
      });

      if (newCurrent !== currentPage) {
        setCurrentPage(newCurrent);
      }
    };

    pdfEl.addEventListener("scroll", handlePDFScroll);
    return () => pdfEl.removeEventListener("scroll", handlePDFScroll);
  }, [numPages, currentPage]);

  // Whenever currentPage changes, update the visible window
  useEffect(() => {
    if (!numPages) return;
    const margin = 3; // number of pages before/after
    const start = Math.max(1, currentPage - margin);
    const end = Math.min(numPages, currentPage + margin);
    setVisibleStartPage(start);
    setVisibleEndPage(end);
  }, [currentPage, numPages]);

  /* ------------------------------
     4) Send a Message
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
      const sessionIdForRequest = docSessionId ?? "null";
      const chatData = await sendChatRequest(
        userText,
        "null",
        sessionIdForRequest,
        docId,
        true
      );
      if (!docSessionId && chatData.chatSessionId) {
        setDocSessionId(chatData.chatSessionId);
      }
      setEphemeralChunks(chatData.chunks || []);
      const allMsgs = chatData.messages;
      const assistantMsg = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : null;
      if (!assistantMsg || assistantMsg.role !== "assistant") {
        setMessages(allMsgs);
        setIsGenerating(false);
        return;
      }
      const updatedMessages = [...allMsgs];
      updatedMessages.pop(); // remove final assistant message for typewriter effect
      setMessages(updatedMessages);
      const fullText = assistantMsg.content;
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setPartialAssistantMessage(fullText.substring(0, i));
        if (i >= fullText.length) {
          clearInterval(interval);
          const final = [...updatedMessages, { ...assistantMsg, content: fullText }];
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
     5) Citation Click => Jump
     ------------------------------ */
  const jumpToPdfPage = (pageNumber: number) => {
    if (numPages) {
      // Just set current page; window effect will happen automatically
      setCurrentPage(pageNumber);
    }
    const targetId = `pdf-page-${pageNumber}`;
    setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 200);
  };

  /* ------------------------------
     6) React-PDF Callbacks
     ------------------------------ */
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
      <Box
        sx={{ flex: 1, borderRight: "1px solid #ccc", overflowY: "auto" }}
        ref={pdfContainerRef}
      >
        {docUrl ? (
          <div style={{ width: "100%", height: "100%", padding: "1rem" }}>
            <Document file={docUrl} onLoadSuccess={onDocumentLoadSuccess}>
              {numPages &&
                Array.from(
                  { length: visibleEndPage - visibleStartPage + 1 },
                  (_, i) => {
                    const pageNumber = visibleStartPage + i;
                    return (
                      <div
                        key={`page_container_${pageNumber}`}
                        className="pdf-page-container"
                        data-page-number={pageNumber}
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
                  }
                )}
              {numPages && visibleEndPage < numPages && (
                <Typography variant="body2" sx={{ color: "white" }}>
                  Scroll to see more pages...
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
              isDocumentChat={true}
              key={index}
              content={msg.content}
              role={msg.role}
              citation={msg.citation}
              chunkReferences={msg.chunkReferences}
              onCitationClick={(chunkNumber: number) => {
                const ref = msg.chunkReferences?.find(
                  (r) => r.displayNumber === chunkNumber
                );
                if (ref && ref.pageNumber) {
                  setHighlightedPage(ref.pageNumber);
                  setHighlightedText("..."); // optional highlight text
                  jumpToPdfPage(ref.pageNumber);
                } else {
                  toast.error(
                    `No chunk found for bracket reference [${chunkNumber}] in this message`
                  );
                }
              }}
            />
          ))}
          {isGenerating && partialAssistantMessage && (
            <ChatItem
              isDocumentChat={true}
              content={partialAssistantMessage}
              role="assistant"
              citation={[]}
              onCitationClick={() => {}}
            />
          )}
          {isGenerating && partialAssistantMessage === "" && (
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

        {/* Input bar */}
        <Box
          sx={{
            p: 2,
            display: "flex",
            borderTop: "1px solid #444",
            backgroundColor: "#1d2d44",
          }}
        >
          <textarea
            ref={inputRef}
            disabled={isGenerating}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            style={{
              flex: 1,
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              color: "white",
              fontSize: "16px",
              resize: "none",
              overflowY: "auto",
              maxHeight: "150px",
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
