import React from "react";
import { Box, Avatar, Typography } from "@mui/material";
import { useAuth } from "../../context/authContext";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { coldarkDark } from "react-syntax-highlighter/dist/esm/styles/prism";

function extractCodeFromString(message: string) {
  if (message.includes("```")) {
    const blocks = message.split("```");
    return blocks;
  }
  return [message]; // Ensure we always return an array
}

function isCodeBlock(str: string) {
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

type ChatItemProps = {
  content: string;
  role: "user" | "assistant";
  citation?: { href: string | null; text: string }[];
};

const ChatItem: React.FC<ChatItemProps> = ({ content, role, citation }) => {
  const messageBlocks = extractCodeFromString(content);
  const auth = useAuth();

  return (
    <Box
      sx={{
        display: "flex",
        p: 2,
        bgcolor: role === "assistant" ? "#004d5612" : "#1d2d44",
        gap: 2,
        borderRadius: 2,
        my: 1,
        width: "100%", // Ensure the component doesn't exceed parent width
        boxSizing: "border-box",
      }}
    >
      <Avatar
        sx={{
          ml: "0",
          bgcolor: role === "assistant" ? undefined : "black",
          color: role === "assistant" ? undefined : "white",
        }}
      >
        {role === "assistant"
          ? null
          : `${auth?.user?.name[0]}${auth?.user?.name.split(" ")[1][0]}`}
      </Avatar>
      <Box sx={{ flex: 1, maxWidth: "100%" }}>
        {messageBlocks &&
          messageBlocks.map((block, idx) =>
            isCodeBlock(block) ? (
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
                {block}
              </SyntaxHighlighter>
            ) : (
              <Typography
                key={idx}
                sx={{
                  fontSize: "20px",
                  wordWrap: "break-word",
                }}
              >
                {block}
              </Typography>
            )
          )}
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
