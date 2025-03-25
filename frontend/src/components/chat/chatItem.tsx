import React, { useState, useRef, useEffect } from "react";
import { Box, Avatar, IconButton, Button } from "@mui/material";
import { useAuth } from "../../context/authContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { coldarkDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import CloseIcon from "@mui/icons-material/Close";
import Loader from "../ui/loader";
import { getChunkText } from "../../helpers/api-communicators";
import ReactDOM from "react-dom";

/**
 * Extract code blocks from a message so we can highlight them properly
 */
function extractBlocks(message: string) {
  const blocks: { type: "code" | "text"; value: string; language?: string }[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/gm;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(message)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: "text", value: message.slice(lastIndex, match.index) });
    }
    blocks.push({
      type: "code",
      value: match[2],
      language: match[1] || "javascript",
    });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < message.length) {
    blocks.push({ type: "text", value: message.slice(lastIndex) });
  }
  return blocks;
}

// For doc-based or stable references
type ChunkReference = {
  chunkId: string;
  displayNumber: number;
  pageNumber?: number;
};

// For ephemeral chunk usage
type ChunkData = {
  chunkNumber: number;
  text: string;
  pageNumber?: number;
};

/**
 * Extend the citation type to include an optional document ID.
 */
export type Citation = {
  href: string | null;
  text: string;
  docId?: string | any;
};

interface ChatItemProps {
  content: string;
  role: "user" | "assistant";
  citation?: Citation[];
  chunkReferences?: ChunkReference[];
  chunks?: ChunkData[]; // for document chat
  onCitationClick?: (chunkNumber: number) => void;
  /**
   * Optional callback to open a document chat for a specific docId.
   */
  onDocumentChat?: (docId: string) => void;
  isDocumentChat?: boolean;
}

interface PopupData {
  open: boolean;
  chunkText: string;
  x: number;
  y: number;
}

/**
 * Helper to derive a display-friendly text, stripping the leading digits+underscore if present.
 */
const getDisplayText = (text: string): string => {
  const match = /^\d+_(.+)$/.exec(text);
  return match ? match[1] : text;
};

/**
 * CitationPopup renders a popup for displaying chunk text.
 */
const CitationPopup: React.FC<{
  chunkText: string;
  x: number;
  y: number;
  onClose: () => void;
}> = ({ chunkText, x, y, onClose }) => {
  return (
    <Box
      sx={{
        position: "fixed",
        top: y,
        left: x,
        width: 300,
        maxHeight: 300,
        overflowY: "auto",
        bgcolor: "white",
        color: "black",
        p: 2,
        boxShadow: 8,
        borderRadius: 2,
        zIndex: 9999,
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <strong>Referenced Text</strong>
        <IconButton size="small" onClick={onClose} sx={{ color: "black", ml: 1 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {/* Ensure chunkText is a string */}
      <Box sx={{ fontSize: "16px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {typeof chunkText === "string" ? chunkText : String(chunkText)}
      </Box>
    </Box>
  );
};

/**
 * CitationOptionsPopup renders two buttons: "New Window" and "Document Chat".
 * - New Window: opens the citation's href in a new tab.
 * - Document Chat: calls onDocumentChat with the provided docId.
 */
interface CitationOptionsPopupProps {
  x: number;
  y: number;
  href: string;
  docId?: string; // We assume docId should be a string if present
  onClose: () => void;
  onDocumentChat: (docId: string) => void;
}

const CitationOptionsPopup: React.FC<CitationOptionsPopupProps> = ({
  x,
  y,
  href,
  docId,
  onClose,
  onDocumentChat,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close the popup when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <Box
      ref={popupRef}
      style={{ position: "fixed", top: `${y}px`, left: `${x}px`, transform: "none" }}
      sx={{
        bgcolor: "transparent",
        p: 0.5,
        boxShadow: 8,
        borderRadius: 2,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Button
        variant="contained"
        size="small"
        sx={{ fontSize: "0.64rem", padding: "3px 6px" }}
        onClick={() => {
          window.open(href, "_blank");
          onClose();
        }}
      >
        New Window
      </Button>
      {docId && typeof docId === "string" && (
        <Button
          variant="contained"
          size="small"
          sx={{ fontSize: "0.64rem", padding: "3px 6px" }}
          onClick={() => {
            onDocumentChat(docId);
            onClose();
          }}
        >
          Document Chat
        </Button>
      )}
    </Box>
  );
};

/**
 * ChatItem component
 */
const ChatItem: React.FC<ChatItemProps> = ({
  content,
  role,
  citation,
  chunkReferences,
  chunks,
  onCitationClick,
  onDocumentChat,
  isDocumentChat = false,
}) => {
  const auth = useAuth();
  const [popupData, setPopupData] = useState<PopupData | null>(null);
  const [optionsPopup, setOptionsPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    href: string;
    docId?: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatItemIdRef = useRef<string>(Math.random().toString(36).substring(2, 9));

  // Close popups if another ChatItem opens one
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail.chatItemId !== chatItemIdRef.current && popupData?.open) {
        setPopupData(null);
      }
      if (e.detail.chatItemId !== chatItemIdRef.current && optionsPopup?.open) {
        setOptionsPopup(null);
      }
    };
    window.addEventListener("citationPopupOpened", handler as EventListener);
    return () => {
      window.removeEventListener("citationPopupOpened", handler as EventListener);
    };
  }, [popupData, optionsPopup]);

  // Close popups when switching chats
  useEffect(() => {
    const clearHandler = () => {
      setPopupData(null);
      setOptionsPopup(null);
    };
    window.addEventListener("clearCitationPopups", clearHandler);
    return () => {
      window.removeEventListener("clearCitationPopups", clearHandler);
    };
  }, []);

  /**
   * Opens the chunk text popup for bracket references
   */
  function openPopup(clientX: number, clientY: number, chunkText: string) {
    const popupWidth = 300;
    const popupHeight = 300;
    let xPos = clientX + 10;
    let yPos = clientY + 10;
    if (xPos + popupWidth > window.innerWidth) {
      xPos = window.innerWidth - popupWidth - 10;
    }
    if (yPos + popupHeight > window.innerHeight) {
      yPos = window.innerHeight - popupHeight - 10;
    }
    setPopupData({ open: true, chunkText, x: xPos, y: yPos });
    window.dispatchEvent(
      new CustomEvent("citationPopupOpened", { detail: { chatItemId: chatItemIdRef.current } })
    );
  }

  /**
   * Splits the given string by bracket references [1], [2] and returns
   * an array of valid React nodes. We re-introduce openPopup calls here
   * so that clicking the bracket shows the chunk text popup.
   */
  function splitBrackets(str: string): React.ReactNode[] {
    const bracketRegex = /(\[\d+\])/g;
    const segments = str.split(bracketRegex);
    const result: React.ReactNode[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (bracketRegex.test(seg)) {
        // seg is something like "[2]"
        const bracketNumber = seg.replace(/\D/g, "");
        const numericBr = Number(bracketNumber);
        result.push(
          <span
            key={`br-${i}`}
            style={{ marginLeft: "4px", color: "blue", cursor: "pointer" }}
            onClick={async (e) => {
              e.stopPropagation();

              // Capture the click position
              const xPos = e.clientX;
              const yPos = e.clientY;

              // If chunkReferences exist, fetch from server
              if (chunkReferences && chunkReferences.length > 0) {
                const ref = chunkReferences.find((c) => c.displayNumber === numericBr);
                if (ref) {
                  try {
                    const data = await getChunkText(ref.chunkId);
                    openPopup(xPos, yPos, data.text ?? "No text found");
                    if (onCitationClick) onCitationClick(numericBr);
                    return;
                  } catch (err) {
                    console.error("Failed to fetch chunk text:", err);
                  }
                }
              }

              // Otherwise, if ephemeral chunk data exists
              if (chunks && chunks.length > 0) {
                const ephemeralChunk = chunks.find((c) => c.chunkNumber === numericBr);
                if (ephemeralChunk) {
                  openPopup(xPos, yPos, ephemeralChunk.text);
                  if (onCitationClick) onCitationClick(numericBr);
                  return;
                }
              }

              // If no chunk found, you could show fallback
              console.warn("No chunk reference found for bracket", numericBr);
            }}
          >
            {seg}
          </span>
        );
      } else {
        // Normal text segment => use ReactMarkdown
        result.push(
          <ReactMarkdown
            key={`txt-${i}`}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              p: ({ node, ...props }) => (
                <span style={{ fontSize: "16px", lineHeight: 1.6, whiteSpace: "pre-wrap" }} {...props} />
              ),
            }}
          >
            {seg}
          </ReactMarkdown>
        );
      }
    }
    return result;
  }

  // Handler for citation link click (file citation)
  const handleCitationClick = (
    e: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    href: string,
    docId?: string
  ) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const popupX = rect.left;
    const popupY = rect.top - 60;

    setOptionsPopup({
      open: true,
      x: popupX,
      y: popupY,
      href,
      docId: typeof docId === "string" ? docId : undefined,
    });
    window.dispatchEvent(
      new CustomEvent("citationPopupOpened", { detail: { chatItemId: chatItemIdRef.current } })
    );
  };

  // If the assistant message is empty (still loading), show loader
  if (role === "assistant" && content.trim() === "") {
    const scaleValue = isDocumentChat ? 0.5 : 1;
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          transform: `scale(${scaleValue})`,
          transformOrigin: "left top",
          m: 1,
        }}
      >
        <Loader />
      </Box>
    );
  }

  const blocks = extractBlocks(content);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: "relative",
        display: "flex",
        p: 1,
        m: 1,
        bgcolor: role === "assistant" ? "#004d5612" : "#1d2d44",
        gap: 1,
        borderRadius: 2,
        width: "calc(100% - 16px)",
        boxSizing: "border-box",
      }}
    >
      <Avatar
        sx={{
          bgcolor: role === "assistant" ? undefined : "black",
          color: role === "assistant" ? undefined : "white",
          width: 32,
          height: 32,
          fontSize: "14px",
        }}
      >
        {role === "assistant"
          ? null
          : `${auth?.user?.name[0]}${auth?.user?.name.split(" ")[1][0]}`}
      </Avatar>

      <Box sx={{ flex: 1, maxWidth: "100%", fontSize: "16px", lineHeight: 1.6 }}>
        {blocks.map((block, idx) => {
          if (block.type === "code") {
            // Code block
            return (
              <SyntaxHighlighter
                key={idx}
                style={coldarkDark}
                language={block.language}
                customStyle={{
                  width: "100%",
                  boxSizing: "border-box",
                  overflowX: "auto",
                  fontSize: "15px",
                }}
                wrapLongLines={true}
                codeTagProps={{
                  style: { whiteSpace: "pre-wrap", wordBreak: "break-word" },
                }}
                preTagProps={{
                  style: { whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 },
                }}
              >
                {block.value.trim()}
              </SyntaxHighlighter>
            );
          } else {
            // Text block => handle bracket references for citations
            const bracketed = splitBrackets(block.value);
            return (
              <Box key={idx} sx={{ mb: 1, color: "white" }}>
                {bracketed}
              </Box>
            );
          }
        })}

        {role === "assistant" && !isDocumentChat && citation && citation.length > 0 && (
          <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
            {citation.map((cit, idx) => {
              const displayText = getDisplayText(cit.text);
              return (
                <a
                  key={idx}
                  href={cit.href || "#"}
                  onClick={(e) => {
                    if (cit.href) {
                      handleCitationClick(e, cit.href, typeof cit.docId === "string" ? cit.docId : undefined);
                    }
                  }}
                  style={{
                    display: "inline-block",
                    padding: "2px 6px",
                    border: "1px solid #1976d2",
                    borderRadius: "12px",
                    color: "#1976d2",
                    textDecoration: "none",
                    fontSize: "14px",
                    backgroundColor: "#e3f2fd",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {displayText}
                </a>
              );
            })}
          </Box>
        )}
      </Box>

      {popupData &&
        popupData.open &&
        ReactDOM.createPortal(
          <CitationPopup
            chunkText={popupData.chunkText}
            x={popupData.x}
            y={popupData.y}
            onClose={() => setPopupData(null)}
          />,
          document.body
        )}

      {optionsPopup &&
        optionsPopup.open &&
        ReactDOM.createPortal(
          <CitationOptionsPopup
            x={optionsPopup.x}
            y={optionsPopup.y}
            href={optionsPopup.href}
            docId={optionsPopup.docId}
            onClose={() => setOptionsPopup(null)}
            onDocumentChat={(docId: string) => {
              if (onDocumentChat) {
                onDocumentChat(docId);
              } else {
                console.log("Document Chat clicked for docId:", docId);
              }
            }}
          />,
          document.body
        )}
    </Box>
  );
};

export default ChatItem;
