import React, { useState } from "react";
import { Box, Avatar, IconButton } from "@mui/material";
import { useAuth } from "../../context/authContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { coldarkDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import CloseIcon from "@mui/icons-material/Close";

/* ------------------------------
   HELPER: code blocks
   ------------------------------ */
function extractBlocks(message: string): {
  type: "code" | "text";
  value: string;
  language?: string;
}[] {
  const blocks: { type: "code" | "text"; value: string; language?: string }[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/gm;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(message)) !== null) {
    // Text before the code block
    if (match.index > lastIndex) {
      blocks.push({
        type: "text",
        value: message.slice(lastIndex, match.index),
      });
    }
    blocks.push({
      type: "code",
      value: match[2],
      language: match[1] || "javascript",
    });
    lastIndex = regex.lastIndex;
  }
  // Any trailing text after the last code block
  if (lastIndex < message.length) {
    blocks.push({
      type: "text",
      value: message.slice(lastIndex),
    });
  }
  return blocks;
}

/* ------------------------------
   TYPES
   ------------------------------ */
type Citation = { href: string | null; text: string };
type ChunkData = {
  chunkNumber: number;
  text: string;
  pageNumber?: number;
};

interface ChatItemProps {
  content: string;
  role: "user" | "assistant";
  citation?: Citation[];
  chunks?: ChunkData[];
  onCitationClick?: (chunkNumber: number) => void; // for bracket clicks
}

/**
 * A small tooltip-like popup for chunk text.
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
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
        }}
      >
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
  chunks,
  onCitationClick,
}) => {
  const auth = useAuth();
  const [popupData, setPopupData] = useState<{
    open: boolean;
    chunkText: string;
    x: number;
    y: number;
  } | null>(null);

  // Break the message into code blocks vs. text
  const messageBlocks = extractBlocks(content);

  /**
   * parseBrackets: Detect "[1]" in text and make them clickable.
   * On click -> open a popup with chunk text and call onCitationClick to jump to the PDF page.
   */
  const parseBrackets = (text: string): React.ReactNode[] => {
    const bracketRegex = /\[(\d+)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = bracketRegex.exec(text)) !== null) {
      const index = match.index;
      const bracketNumber = match[1];
      if (index > lastIndex) {
        parts.push(text.slice(lastIndex, index));
      }

      parts.push(
        <span
          key={`bracket-${index}`}
          style={{ color: "blue", cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            const chunk = chunks?.find((c) => c.chunkNumber === Number(bracketNumber));
            if (chunk) {
              // 1) Show chunk text popup
              const popupWidth = 300;
              const popupHeight = 300;
              let xPos = e.clientX + 10;
              let yPos = e.clientY + window.scrollY + 10;
              if (xPos + popupWidth > window.innerWidth) {
                xPos = window.innerWidth - popupWidth - 10;
              }
              const fullHeight = window.innerHeight + window.scrollY;
              if (yPos + popupHeight > fullHeight) {
                yPos = fullHeight - popupHeight - 10;
              }
              setPopupData({
                open: true,
                chunkText: chunk.text,
                x: xPos,
                y: yPos,
              });

              // 2) Jump to chunk page in the PDF
              if (onCitationClick) {
                onCitationClick(Number(bracketNumber));
              }
            } else {
              console.error(`No chunk found for bracket [${bracketNumber}].`);
            }
          }}
        >
          [{bracketNumber}]
        </span>
      );
      lastIndex = bracketRegex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  };

  return (
    <Box
      sx={{
        display: "flex",
        p: 1, // Reduced padding for a compact layout
        m: 1, // Small margin between items
        bgcolor: role === "assistant" ? "#004d5612" : "#1d2d44",
        gap: 1,
        borderRadius: 2,
        width: "calc(100% - 16px)", // Account for external margins
        boxSizing: "border-box",
      }}
    >
      {/* Avatar */}
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

      {/* Message Body */}
      <Box sx={{ flex: 1, maxWidth: "100%", fontSize: "16px", lineHeight: 1.6 }}>
        {messageBlocks.map((block, idx) => {
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
                  style: {
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  },
                }}
                preTagProps={{
                  style: {
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                  },
                }}
              >
                {block.value.trim()}
              </SyntaxHighlighter>
            );
          } else {
            // Parse bracket references in plain text
            const bracketedNodes = parseBrackets(block.value.trim());
            return (
              <Box
                key={idx}
                sx={{
                  fontSize: "16px",
                  lineHeight: 1.6,
                  mb: 1,
                  color: "white",
                }}
              >
                {bracketedNodes.map((node, i) => {
                  if (typeof node === "string") {
                    return (
                      <ReactMarkdown
                        key={`txt-${i}`}
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          // Changed 'p' to 'span' to render inline elements
                          span: ({ node, ...props }) => (
                            <span
                              style={{ fontSize: "16px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}
                              {...props}
                            />
                          ),
                        }}
                      >
                        {node}
                      </ReactMarkdown>
                    );
                  }
                  return node;
                })}
              </Box>
            );
          }
        })}

        {/* Citations if role=assistant */}
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

      {/* Popup for chunk text */}
      {popupData && popupData.open && (
        <CitationPopup
          chunkText={popupData.chunkText}
          x={popupData.x}
          y={popupData.y}
          onClose={() => setPopupData(null)}
        />
      )}
    </Box>
  );
};

export default ChatItem;
