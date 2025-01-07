import React, { useState } from "react";
import { Box, Avatar, IconButton } from "@mui/material";
import { useAuth } from "../../context/authContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { coldarkDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import CloseIcon from "@mui/icons-material/Close";

/* ------------------------------
   HELPERS: detect code blocks
   ------------------------------ */
function extractCodeFromString(message: string) {
  if (message.includes("```")) {
    return message.split("```");
  }
  return [message];
}

function isCodeBlock(str: string) {
  // Basic heuristic to guess if the block is code
  if (
    str.includes(";") ||
    str.includes("{") ||
    str.includes("}") ||
    str.includes("#") ||
    str.includes("//")
  ) {
    return true;
  }
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
 * A small tooltip-like popup for chunk text
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

  // Break the LLM message into blocks (code vs. non-code)
  const messageBlocks = extractCodeFromString(content);

  /**
   * Convert bracket references "[1]" etc. into clickable <span>.
   * When clicked, show the chunk text in a floating popup near the cursor.
   * We also clamp x,y so the popup doesn't spill off-screen.
   */
  const parseBrackets = (text: string): React.ReactNode[] => {
    const bracketRegex = /\[(\d+)\]/g;
    const parts: React.ReactNode[] = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = bracketRegex.exec(text)) !== null) {
      const index = match.index;
      const bracketNumber = match[1]; // e.g. "1" or "2"

      // Text before the bracket
      if (index > lastIndex) {
        parts.push(text.slice(lastIndex, index));
      }

      parts.push(
        <span
          key={`bracket-${index}`}
          style={{ color: "blue", cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            console.log("Clicked bracket =>", bracketNumber);
            const chunk = chunks?.find(
              (c) => c.chunkNumber === Number(bracketNumber)
            );
            console.log("Found chunk =>", chunk);

            if (chunk) {
              // We'll define a popup width/height
              const popupWidth = 300;
              const popupHeight = 300;

              // Start with the raw position
              let xPos = e.clientX + 10;
              let yPos = e.clientY + window.scrollY + 10;

              // Now clamp horizontally (so it doesn't go off the right edge)
              if (xPos + popupWidth > window.innerWidth) {
                xPos = window.innerWidth - popupWidth - 10;
              }

              // Now clamp vertically (so it doesn't go off the bottom edge)
              // Remember the user might be scrolled down so we consider window.scrollY
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

    // Remaining text after the last bracket
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
          : // e.g. user "John Doe" => "JD"
            `${auth?.user?.name[0]}${auth?.user?.name.split(" ")[1][0]}`}
      </Avatar>

      {/* Content */}
      <Box sx={{ flex: 1, maxWidth: "100%" }}>
        {messageBlocks.map((block, idx) => {
          const trimmed = block.trim();

          if (isCodeBlock(trimmed)) {
            // Render code block
            return (
              <SyntaxHighlighter
                key={idx}
                style={coldarkDark}
                language="javascript"
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
                {trimmed}
              </SyntaxHighlighter>
            );
          } else {
            // Non-code block
            // Parse bracket references first
            const bracketedNodes = parseBrackets(trimmed);

            // Then feed each text segment to ReactMarkdown
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
                    // If it's just a normal text segment
                    return (
                      <ReactMarkdown
                        key={`txt-${i}`}
                        remarkPlugins={[remarkGfm]}
                        components={{ p: ({ children }) => <>{children}</> }}
                      >
                        {node}
                      </ReactMarkdown>
                    );
                  }
                  // It's our clickable bracket <span> or any React element
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
