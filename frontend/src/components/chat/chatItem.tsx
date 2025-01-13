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
   HELPER: robust extraction of code blocks
   ------------------------------ */

/**
 * Use regex to find code blocks delimited by triple backticks.
 * This function returns an array of objects, where each object represents either a code block or a text block.
 * The shape:
 *   - { type: 'code', value: string, language?: string } for code blocks
 *   - { type: 'text', value: string } for non-code text
 */
function extractBlocks(message: string): { type: "code" | "text"; value: string; language?: string }[] {
  const blocks: { type: "code" | "text"; value: string; language?: string }[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/gm;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(message)) !== null) {
    // Push text that appears before the code block match
    if (match.index > lastIndex) {
      blocks.push({
        type: "text",
        value: message.slice(lastIndex, match.index),
      });
    }
    // match[1] is the optional language (if provided)
    // match[2] is the code content.
    blocks.push({
      type: "code",
      value: match[2],
      language: match[1] || "javascript", // default language is javascript
    });
    lastIndex = regex.lastIndex;
  }
  // Push any remaining text after the last code block
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
};

type ChatItemProps = {
  content: string;
  role: "user" | "assistant";
  citation?: Citation[];
  chunks?: ChunkData[];
};

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
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: "black", ml: 1 }}
        >
          <CloseIcon />
        </IconButton>
      </Box>
      <Box
        sx={{
          fontSize: "14px",
          lineHeight: 1.4,
          whiteSpace: "pre-wrap",
        }}
      >
        {chunkText}
      </Box>
    </Box>
  );
};

const ChatItem: React.FC<ChatItemProps> = ({ content, role, citation, chunks }) => {
  const auth = useAuth();

  // State for popup
  const [popupData, setPopupData] = useState<{
    open: boolean;
    chunkText: string;
    x: number;
    y: number;
  } | null>(null);

  // Extract blocks (code vs text) using the regex-based function
  const messageBlocks = extractBlocks(content);

  /**
   * Convert bracket references "[1]" etc. into clickable <span>.
   * When clicked, show the chunk text in a floating popup near the cursor.
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
            const chunk = chunks?.find(
              (c) => c.chunkNumber === Number(bracketNumber)
            );
            if (chunk) {
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
            } else {
              console.error(
                `No chunk found for bracket [${bracketNumber}] in parseBrackets.`
              );
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
        p: 2,
        bgcolor: role === "assistant" ? "#004d5612" : "#1d2d44",
        gap: 2,
        borderRadius: 2,
        my: 1,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Avatar */}
      <Avatar
        sx={{
          ml: 0,
          bgcolor: role === "assistant" ? undefined : "black",
          color: role === "assistant" ? undefined : "white",
        }}
      >
        {role === "assistant"
          ? null
          : `${auth?.user?.name[0]}${auth?.user?.name.split(" ")[1][0]}`}
      </Avatar>

      {/* Content */}
      <Box sx={{ flex: 1, maxWidth: "100%" }}>
        {messageBlocks.map((block, idx) => {
          if (block.type === "code") {
            // Render code block with syntax highlighter.
            return (
              <SyntaxHighlighter
                key={idx}
                style={coldarkDark}
                language={block.language}
                customStyle={{
                  width: "100%",
                  boxSizing: "border-box",
                  overflowX: "auto",
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
            // For text blocks, parse bracket references and render Markdown.
            const bracketedNodes = parseBrackets(block.value.trim());
            return (
              <Box
                key={idx}
                sx={{
                  fontSize: "18px",
                  lineHeight: 2,
                  mb: 2,
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
                          // Allow proper new line breaks by rendering <br />
                          p: ({ node, ...props }) => <p {...props} />,
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
          <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
            {citation.map((cit, idx) =>
              cit.href ? (
                <a
                  key={idx}
                  href={cit.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "4px 8px",
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
                    padding: "4px 8px",
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
