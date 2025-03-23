import React, { useState, useRef, useEffect } from "react";
import { Box, Avatar, IconButton } from "@mui/material";
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

// Code-block extraction unchanged
function extractBlocks(message: string) {
  const blocks: { type: "code" | "text"; value: string; language?: string }[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/gm;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(message)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: "text", value: message.slice(lastIndex, match.index) });
    }
    blocks.push({ type: "code", value: match[2], language: match[1] || "javascript" });
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

// Citation type
type Citation = { href: string | null; text: string };

interface ChatItemProps {
  content: string;
  role: "user" | "assistant";
  citation?: Citation[];
  chunkReferences?: ChunkReference[];
  chunks?: ChunkData[]; // for document chat
  onCitationClick?: (chunkNumber: number) => void;
  isDocumentChat?: boolean;
}

interface PopupData {
  open: boolean;
  chunkText: string;
  x: number;
  y: number;
}

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
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ fontSize: "16px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {chunkText}
      </Box>
    </Box>
  );
};

const ChatItem: React.FC<ChatItemProps> = ({
  content,
  role,
  citation,
  chunkReferences,
  chunks,
  onCitationClick,
  isDocumentChat = false,
}) => {
  const auth = useAuth();
  const [popupData, setPopupData] = useState<PopupData | null>(null);
  // containerRef is used to constrain the popup within this ChatItem
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Each ChatItem gets a unique identifier
  const chatItemIdRef = useRef<string>(Math.random().toString(36).substring(2, 9));

  // Listen for global popup events to close any open popup if another ChatItem opens one.
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail.chatItemId !== chatItemIdRef.current && popupData?.open) {
        setPopupData(null);
      }
    };
    window.addEventListener("citationPopupOpened", handler as EventListener);
    return () => {
      window.removeEventListener("citationPopupOpened", handler as EventListener);
    };
  }, [popupData]);

  // Listen for clear event to close popup when switching chats.
  useEffect(() => {
    const clearHandler = () => {
      setPopupData(null);
    };
    window.addEventListener("clearCitationPopups", clearHandler);
    return () => {
      window.removeEventListener("clearCitationPopups", clearHandler);
    };
  }, []);

  // For bracket references, we do a custom parse that merges lines if needed.
  function splitBrackets(str: string): React.ReactNode[] {
    const bracketRegex = /(\[\d+\])/g;
    const segments = str.split(bracketRegex);
    const result: React.ReactNode[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (bracketRegex.test(seg)) {
        // It's a bracket reference like "[3]"
        const bracketNumber = seg.replace(/\D/g, ""); // extract digits
        result.push(
          <span
            key={`br-${i}`}
            style={{ marginLeft: "4px", color: "blue", cursor: "pointer" }}
            onClick={async (e) => {
              e.stopPropagation();
              const numericBr = Number(bracketNumber);
              // Get bounding rectangle from the event target
              const targetRect = e.currentTarget.getBoundingClientRect();
              // Compute initial viewport coordinates.
              let xPos = targetRect.left + 10;
              let yPos = targetRect.bottom + 10; // Removed window.scrollY
              // Try stable reference first.
              if (chunkReferences && chunkReferences.length > 0) {
                const ref = chunkReferences.find((c) => c.displayNumber === numericBr);
                if (ref) {
                  try {
                    const data = await getChunkText(ref.chunkId);
                    openPopup(xPos, yPos, data.text ?? "No text found");
                    if (onCitationClick) {
                      onCitationClick(numericBr);
                    }
                    return;
                  } catch (err) {
                    console.error("Failed to fetch chunk text:", err);
                  }
                }
              }
              // Fallback to ephemeral approach.
              if (chunks && chunks.length > 0) {
                const ephemeralChunk = chunks.find((c) => c.chunkNumber === numericBr);
                if (ephemeralChunk) {
                  openPopup(xPos, yPos, ephemeralChunk.text);
                  if (onCitationClick) {
                    onCitationClick(numericBr);
                  }
                  return;
                }
              }
            }}
          >
            {seg}
          </span>
        );
      } else {
        // Normal text: render via ReactMarkdown.
        result.push(
          <ReactMarkdown
            key={`txt-${i}`}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              // Render paragraphs inline.
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

  // Open the citation popup using viewport dimensions without adding window.scrollY.
  function openPopup(x: number, y: number, chunkText: string) {
    const popupWidth = 300;
    const popupHeight = 300;
    let xPos = x + 10;
    let yPos = y + 10; // Removed window.scrollY here
    if (xPos + popupWidth > window.innerWidth) {
      xPos = window.innerWidth - popupWidth - 10;
    }
    if (yPos + popupHeight > window.innerHeight) {
      yPos = window.innerHeight - popupHeight - 10;
    }
    setPopupData({ open: true, chunkText, x: xPos, y: yPos });
    // Dispatch a global event so that other ChatItems close their popups.
    window.dispatchEvent(
      new CustomEvent("citationPopupOpened", { detail: { chatItemId: chatItemIdRef.current } })
    );
  }

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

      {/* Message body */}
      <Box sx={{ flex: 1, maxWidth: "100%", fontSize: "16px", lineHeight: 1.6 }}>
        {extractBlocks(content).map((block, idx) => {
          if (block.type === "code") {
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
            // Process bracket references.
            const children = splitBrackets(block.value);
            return (
              <Box key={idx} sx={{ mb: 1, color: "white" }}>
                {children}
              </Box>
            );
          }
        })}

        {/* Render any citation links */}
        {role === "assistant" && citation && citation.length > 0 && (
          <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
            {citation.map((cit, idx) =>
              cit.href ? (
                <a
                  key={idx}
                  href={cit.href}
                  target="_blank"
                  rel="noopener noreferrer"
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
                  }}
                >
                  {cit.text}
                </a>
              ) : (
                <span
                  key={idx}
                  style={{
                    display: "inline-block",
                    padding: "2px 6px",
                    border: "1px solid #ccc",
                    borderRadius: "12px",
                    color: "#333",
                    fontSize: "14px",
                    backgroundColor: "#f5f5f5",
                    fontWeight: 500,
                  }}
                >
                  {cit.text}
                </span>
              )
            )}
          </Box>
        )}
      </Box>

      {/* Render the citation popup using a portal */}
      {popupData && popupData.open &&
        ReactDOM.createPortal(
          <CitationPopup
            chunkText={popupData.chunkText}
            x={popupData.x}
            y={popupData.y}
            onClose={() => setPopupData(null)}
          />,
          document.body
        )
      }
    </Box>
  );
};

export default ChatItem;
