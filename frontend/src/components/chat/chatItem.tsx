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
  return role === "assistant" ? (
    <Box
      sx={{
        display: "flex",
        p: 2,
        bgcolor: "#004d5612",
        gap: 2,
        borderRadius: 2,
        my: 1,
      }}
    >
      <Avatar sx={{ ml: "0" }}></Avatar>
      <Box>
        {messageBlocks &&
          messageBlocks.map((block, idx) =>
            isCodeBlock(block) ? (
              <SyntaxHighlighter
                key={idx}
                style={coldarkDark}
                language="javascript"
              >
                {block}
              </SyntaxHighlighter>
            ) : (
              <Typography key={idx} sx={{ fontSize: "20px" }}>
                {block}
              </Typography>
            )
          )}
        {citation && citation.length > 0 && (
          <Typography sx={{ fontSize: "16px", fontStyle: "italic", mt: 1 }}>
            {citation.map((cit, idx) =>
              cit.href ? (
                <a
                  key={idx}
                  href={cit.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#1976d2",
                    textDecoration: "underline",
                    marginRight: "8px",
                  }}
                >
                  {cit.text}
                </a>
              ) : (
                <span key={idx} style={{ marginRight: "8px" }}>
                  {cit.text}
                </span>
              )
            )}
          </Typography>
        )}
      </Box>
    </Box>
  ) : (
    <Box
      sx={{
        display: "flex",
        p: 2,
        bgcolor: "#004d56",
        gap: 2,
        borderRadius: 2,
      }}
    >
      <Avatar sx={{ ml: "0", bgcolor: "black", color: "white" }}>
        {auth?.user?.name[0]}
        {auth?.user?.name.split(" ")[1][0]}
      </Avatar>
      <Box>
        {messageBlocks &&
          messageBlocks.map((block, idx) =>
            isCodeBlock(block) ? (
              <SyntaxHighlighter
                key={idx}
                style={coldarkDark}
                language="javascript"
              >
                {block}
              </SyntaxHighlighter>
            ) : (
              <Typography key={idx} sx={{ fontSize: "20px" }}>
                {block}
              </Typography>
            )
          )}
      </Box>
    </Box>
  );
};

export default ChatItem;
