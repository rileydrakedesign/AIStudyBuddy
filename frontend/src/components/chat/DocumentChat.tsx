// src/components/documentChat.tsx
import React, { useEffect, useRef, useState } from "react";
import { Box, IconButton, Typography, Button, ToggleButtonGroup, ToggleButton } from "@mui/material";
import { IoMdSend } from "react-icons/io";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import Loader from "../ui/loader";
import ChatItem from "../chat/chatItem";
import toast from "react-hot-toast";
import { getDocumentFile, getDocumentSummary, sendChatRequest } from "../../helpers/api-communicators";
import { Document, Page, pdfjs } from "react-pdf";
import ReactMarkdown from "react-markdown";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.js`;

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
  // Each message stores its own stable chunk references.
  chunkReferences?: ChunkReference[];
  versions?: string[]; 
  currentVersion?: number; 
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

  // PDF / paging: define a visible window with start and end pages.
  const [numPages, setNumPages] = useState<number | null>(null);
  const [visibleStartPage, setVisibleStartPage] = useState(1);
  const [visibleEndPage, setVisibleEndPage] = useState(3);
  const [scale, setScale] = useState(1.0);

  // For highlighting in PDF
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  // View mode toggle (PDF or Summary)
  const [viewMode, setViewMode] = useState<"pdf" | "summary">("pdf");

  // Summary state
  const [summaryContent, setSummaryContent] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Refs for chat & PDF scrolling
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /* ------------------------------
     AUTO-RESIZE & CURSOR HANDLERS FOR TEXTAREA
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

  const collapseRetries = (msgs: Message[]): Message[] => {
    const out: Message[] = [];
    msgs.forEach((m) => {
      if (
        m.role === "assistant" &&
        out.length &&
        out[out.length - 1].role === "assistant"
      ) {
        const prev = out[out.length - 1];
        if (!prev.versions) prev.versions = [prev.content];
        prev.versions.push(m.content);          // keep only first + latest
        if (prev.versions.length > 2) prev.versions = prev.versions.slice(0, 2);
        prev.currentVersion = prev.versions.length - 1;
        prev.content = m.content;
      } else {
        out.push({ ...m });
      }
    });
    return out;
  };
  

  /* ------------------------------
     1) Fetch Document URL from S3
     ------------------------------ */
useEffect(() => {
  // Reset URL so we don't briefly show the previous PDF
  setDocUrl(null);
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

// When switching documents inside DocumentChat, start fresh
useEffect(() => {
  setDocSessionId(null);
  setMessages([]);
  setEphemeralChunks([]);
  setIsGenerating(false);
  setPartialAssistantMessage("");
  setHighlightedPage(null);
  setHighlightedText(null);
  setVisibleStartPage(1);
  setVisibleEndPage(3);
  setViewMode("pdf"); // Reset to PDF view when switching documents
  // Reset scroll positions
  if (chatContainerRef.current) chatContainerRef.current.scrollTop = 0;
  if (pdfContainerRef.current) pdfContainerRef.current.scrollTop = 0;
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
     3) PDF Infinite Scroll - Forward
     ------------------------------ */
  useEffect(() => {
    const pdfEl = pdfContainerRef.current;
    if (!pdfEl) return;
    const handlePDFScrollDown = () => {
      if (!numPages) return;
      const { scrollTop, scrollHeight, clientHeight } = pdfEl;
      if (scrollHeight - scrollTop - clientHeight < 300) {
        setVisibleEndPage((prev) => {
          const nextVal = prev + 3;
          return nextVal > numPages ? numPages : nextVal;
        });
      }
    };
    pdfEl.addEventListener("scroll", handlePDFScrollDown);
    return () => pdfEl.removeEventListener("scroll", handlePDFScrollDown);
  }, [numPages]);

  /* ------------------------------
     3b) PDF Infinite Scroll - Backward
     ------------------------------ */
  useEffect(() => {
    const pdfEl = pdfContainerRef.current;
    if (!pdfEl) return;
    const handlePDFScrollUp = () => {
      if (!numPages) return;
      const { scrollTop } = pdfEl;
      if (scrollTop < 100 && visibleStartPage > 1) {
        setVisibleStartPage((prev) => Math.max(1, prev - 3));
      }
    };
    pdfEl.addEventListener("scroll", handlePDFScrollUp);
    return () => pdfEl.removeEventListener("scroll", handlePDFScrollUp);
  }, [numPages, visibleStartPage]);

  /* ------------------------------
     4) Pre-fetch Summary in background when document loads
     ------------------------------ */
  useEffect(() => {
    // Fetch stored summary directly from database when document loads
    // This retrieves the raw summary text without LLM processing
    if (docId && !summaryContent && !summaryLoading && !summaryError) {
      const fetchSummary = async () => {
        setSummaryLoading(true);

        try {
          // Fetch summary directly from database endpoint
          const data = await getDocumentSummary(docId);

          if (data.success && data.summary && data.summary.content) {
            setSummaryContent(data.summary.content);
          } else {
            setSummaryError("No summary available for this document.");
          }
        } catch (err) {
          console.error("Failed to fetch summary:", err);
          setSummaryError("Failed to load summary. Please try again.");
        } finally {
          setSummaryLoading(false);
        }
      };

      fetchSummary();
    }
  }, [docId, summaryContent, summaryLoading, summaryError]); // Fetch when docId changes

  /* ------------------------------ RETRY CHAT (doc) ------------------------------ */
const handleRetry = async (assistantIdx: number) => {
  if (isGenerating) return;
  if (assistantIdx <= 0 || assistantIdx >= messages.length) return;

  const userMsg      = messages[assistantIdx - 1];
  const assistantMsg = messages[assistantIdx];

  if (userMsg.role !== "user" || assistantMsg.role !== "assistant") return;

  try {
    setIsGenerating(true);

    const sessId = docSessionId ?? "null";

    // same endpoint, last arg = retry = true
    const chatData = await sendChatRequest(
      userMsg.content,
      "null",      // class
      sessId,
      docId,
      true,        // ephemeral
      true         // retry
    );

    if (!docSessionId && chatData.chatSessionId) {
      setDocSessionId(chatData.chatSessionId);
    }

    // server returns full msg list → collapse to 1 bubble per Q/A
    setMessages(collapseRetries(chatData.messages));
  } catch (err) {
    console.error("Retry failed", err);
    toast.error("Retry failed");
  } finally {
    setIsGenerating(false);
  }
};

  

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
      setMessages(collapseRetries(updatedMessages));
      const fullText = assistantMsg.content;
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setPartialAssistantMessage(fullText.substring(0, i));
        if (i >= fullText.length) {
          clearInterval(interval);
          const final = [...updatedMessages, { ...assistantMsg, content: fullText }];
          setMessages(collapseRetries(final));
          setPartialAssistantMessage("");
          setIsGenerating(false);
        }
      }, 2);
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
     5) Citation Click => Highlight Text + Jump to PDF Page
        (FIXED: more reliable scroll)
     ------------------------------ */
  const jumpToPdfPage = (pageNumber: number) => {
    const margin = 3;
    if (numPages) {
      const newStart = Math.max(1, pageNumber - margin);
      const newEnd   = Math.min(numPages, pageNumber + margin);
      setVisibleStartPage(newStart);
      setVisibleEndPage(newEnd);
    }

    const targetId = `pdf-page-${pageNumber}`;

    // Keep scrolling until the layout stabilises or retries run out.
    const scrollToTarget = (retries = 15) => {
      const el  = document.getElementById(targetId);
      const box = pdfContainerRef.current;

      if (!el || !box) {
        // Either the page hasn’t rendered yet or the container is missing.
        if (retries > 0) setTimeout(() => scrollToTarget(retries - 1), 100);
        return;
      }

      // Get element’s current position inside the scrolling box.
      const elRect  = el.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      const isInside =
        elRect.top >= boxRect.top + 4 && elRect.bottom <= boxRect.bottom - 4;

      if (!isInside) {
        // Not fully visible yet → scroll and try again.
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        if (retries > 0) setTimeout(() => scrollToTarget(retries - 1), 100);
      }
    };

    scrollToTarget();
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
    <Box sx={{ display: "flex", height: "100%", overflow: "hidden", gap: 2, p: 2 }}>
      {/* Left side: PDF viewer */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
          borderRadius: "var(--radius-lg)",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
        }}
      >
        {/* PDF Controls */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "rgba(0, 77, 86, 0.07)",
          }}
        >
          <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 600 }}>
            {numPages ? `Page ${visibleStartPage} / ${numPages}` : "Loading..."}
          </Typography>

          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newValue) => {
              if (newValue !== null) {
                setViewMode(newValue);
              }
            }}
            size="small"
            sx={{
              "& .MuiToggleButton-root": {
                color: "text.primary",
                borderColor: "divider",
                "&.Mui-selected": {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": {
                    bgcolor: "primary.dark",
                  },
                },
              },
            }}
          >
            <ToggleButton value="pdf">
              📄 PDF
            </ToggleButton>
            <ToggleButton value="summary">
              📝 Summary
            </ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <IconButton
              size="small"
              onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
              sx={{
                color: "text.primary",
                bgcolor: "background.default",
                "&:hover": { bgcolor: "neutral.700" },
              }}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>

            <Typography variant="body2" sx={{ color: "text.primary", minWidth: "50px", textAlign: "center" }}>
              {Math.round(scale * 100)}%
            </Typography>

            <IconButton
              size="small"
              onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
              sx={{
                color: "text.primary",
                bgcolor: "background.default",
                "&:hover": { bgcolor: "neutral.700" },
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* PDF Content */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            justifyContent: "center",
            bgcolor: "background.default",
            scrollBehavior: "smooth",
          }}
          ref={pdfContainerRef}
        >
          {viewMode === "pdf" ? (
            // PDF View
            docUrl ? (
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
                            id={`pdf-page-${pageNumber}`}
                            style={{ marginBottom: "2rem", display: "flex", justifyContent: "center" }}
                          >
                            <Page
                              pageNumber={pageNumber}
                              width={600 * scale}
                              customTextRenderer={customTextRenderer(pageNumber)}
                            />
                          </div>
                        );
                      }
                    )}
                  {numPages && visibleEndPage < numPages && (
                    <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
                      Scroll down to load more pages...
                    </Typography>
                  )}
                </Document>
              </div>
            ) : (
              <Typography variant="body1" sx={{ m: 2, color: "text.primary" }}>
                Loading document...
              </Typography>
            )
          ) : (
            // Summary View
            <Box
              sx={{
                width: "100%",
                maxWidth: "800px",
                p: 3,
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  color: "text.primary",
                  fontWeight: 600,
                  mb: 3,
                }}
              >
                Document Summary
              </Typography>

              {summaryLoading && (
                <Typography variant="body1" sx={{ color: "text.secondary" }}>
                  Loading summary...
                </Typography>
              )}

              {summaryError && !summaryLoading && (
                <Typography
                  variant="body1"
                  sx={{
                    color: "error.main",
                    lineHeight: 1.8,
                  }}
                >
                  {summaryError}
                </Typography>
              )}

              {summaryContent && !summaryLoading && !summaryError && (
                <Box
                  sx={{
                    "& h1, & h2, & h3, & h4, & h5, & h6": {
                      color: "text.primary",
                      mt: 2,
                      mb: 1,
                      fontWeight: 600,
                    },
                    "& p": {
                      color: "text.secondary",
                      lineHeight: 1.8,
                      mb: 2,
                    },
                    "& ul, & ol": {
                      color: "text.secondary",
                      pl: 3,
                      mb: 2,
                    },
                    "& li": {
                      mb: 0.5,
                    },
                    "& a": {
                      color: "primary.main",
                      textDecoration: "none",
                      "&:hover": {
                        textDecoration: "underline",
                      },
                    },
                  }}
                >
                  <ReactMarkdown>{summaryContent}</ReactMarkdown>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Right side: chat area */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
          borderRadius: "var(--radius-lg)",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
        }}
      >
        {/* Top bar */}
        <Box
          sx={{
            p: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            bgcolor: "rgba(0, 77, 86, 0.07)",
          }}
        >
          <Typography variant="h6" sx={{ color: "text.primary", fontWeight: 600 }}>
            Document Chat
          </Typography>
          <Button
            onClick={onClose}
            variant="outlined"
            size="small"
            sx={{
              color: "text.primary",
              borderColor: "divider",
              "&:hover": {
                borderColor: "primary.main",
                bgcolor: "rgba(14, 165, 233, 0.1)",
              },
            }}
          >
            Back
          </Button>
        </Box>

        {/* Chat messages */}
        <Box
          ref={chatContainerRef}
          sx={{ flexGrow: 1, overflowY: "auto", p: 2, bgcolor: "background.default" }}
        >
          {messages.map((msg, index) => (
            <ChatItem
              isDocumentChat={true}
              key={index}
              content={msg.content}
              role={msg.role}
              citation={msg.citation}
              chunkReferences={msg.chunkReferences}
              messageIndex={index}
              onRetry={handleRetry}
              versions={msg.versions}
              currentVersion={msg.currentVersion}
              onCitationClick={(chunkNumber: number) => {
                const ref = msg.chunkReferences?.find(
                  (r) => r.displayNumber === chunkNumber
                );
                if (ref && ref.pageNumber) {
                  setHighlightedPage(ref.pageNumber);
                  setHighlightedText("..."); // Optionally, fetch or set highlighted text here
                  jumpToPdfPage(ref.pageNumber);
                } else {
                  toast.error(`No chunk found for bracket reference [${chunkNumber}] in this message`);
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
              messageIndex={messages.length}
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
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              bgcolor: "background.default",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "var(--radius-md)",
              p: 1,
            }}
          >
            <textarea
              ref={inputRef}
              disabled={isGenerating}
              placeholder="Ask about this document..."
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={handlePaste}
              style={{
                flex: 1,
                backgroundColor: "transparent",
                border: "none",
                outline: "none",
                color: "#CBD5E1",
                fontSize: "16px",
                resize: "none",
                overflowY: "auto",
                maxHeight: "150px",
                fontFamily: "var(--font-primary)",
              }}
            />
            {!isGenerating ? (
              <IconButton onClick={handleSend} sx={{ color: "primary.main", ml: 1 }}>
                <IoMdSend />
              </IconButton>
            ) : (
              <IconButton onClick={handleStop} sx={{ color: "text.primary", ml: 1 }}>
                <Box sx={{ width: 16, height: 16, bgcolor: "text.primary" }} />
              </IconButton>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default DocumentChat;
