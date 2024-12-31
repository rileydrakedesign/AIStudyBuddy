import React from "react";
import { Box, Avatar } from "@mui/material";
import { useAuth } from "../../context/authContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { coldarkDark } from "react-syntax-highlighter/dist/esm/styles/prism";

/* ------------------------------
   HELPERS: detect code blocks
   ------------------------------ */
function extractCodeFromString(message: string) {
  // If the LLM response contains triple backticks ```,
  // we split on them. E.g., "text ```code``` more text"
  // returns ["text ", "code", " more text"].
  if (message.includes("```")) {
    return message.split("```");
  }
  return [message]; // fallback: entire message is one block
}

function isCodeBlock(str: string) {
  // Basic heuristic to decide if the block is code.
  // Adjust if needed to fit your syntax detection logic.
  if (
    str.includes("=") ||
    str.includes(";") ||
    str.includes("[") ||
    str.includes("]") ||
    str.includes("{") ||
    str.includes("}") ||
    str.includes("#") ||
    str.includes("//")
  ) {
    return true;
  }
  return false;
}

/* ------------------------------
   TYPES
   ------------------------------ */
type ChatItemProps = {
  content: string;
  role: "user" | "assistant";
  citation?: { href: string | null; text: string }[];
};

const ChatItem: React.FC<ChatItemProps> = ({ content, role, citation }) => {
  const auth = useAuth();
  // Split the message into blocks (code vs. non-code)
  const messageBlocks = extractCodeFromString(content);

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
            // Render as code block
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
            // Render as Markdown text, wrapped in a Box with custom font/spacing
            return (
              <Box
                key={idx}
                sx={{
                  fontSize: "18px",
                  lineHeight: 2,
                  mb: 2, // bottom margin for spacing
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {trimmed}
                </ReactMarkdown>
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
    </Box>
  );
};

export default ChatItem;
