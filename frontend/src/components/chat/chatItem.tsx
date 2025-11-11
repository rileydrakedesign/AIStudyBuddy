import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Avatar,
  IconButton,
  Button,
  Popper,
  ClickAwayListener,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import { useAuth } from "../../context/authContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { coldarkDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import CloseIcon from "@mui/icons-material/Close";
import Loader from "../ui/loader";
import { getChunkText } from "../../helpers/api-communicators";
import "katex/dist/katex.min.css";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ThumbUpOffAltIcon from "@mui/icons-material/ThumbUpOffAlt";
import ThumbDownOffAltIcon from "@mui/icons-material/ThumbDownOffAlt";
import LoopIcon from "@mui/icons-material/Loop";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ThumbUpIcon    from "@mui/icons-material/ThumbUp";
import ThumbDownIcon  from "@mui/icons-material/ThumbDown";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SaveIcon from "@mui/icons-material/Save";
import DownloadIcon from "@mui/icons-material/Download";
import toast from "react-hot-toast";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";




/* ------------------------------
   HELPERS
   ------------------------------ */

/**
 * Detect response type based on content
 * Used for special formatting of study guides
 */
type ResponseType = "study-guide" | "normal";

function detectResponseType(content: string): ResponseType {
  const lower = content.toLowerCase();
  if (lower.includes("study guide")) return "study-guide";
  return "normal";
}

/**
 * Get special formatting styles based on response type
 */
function getSpecialFormatting(type: ResponseType) {
  switch (type) {
    case "study-guide":
      return {
        borderColor: "primary.main",
        backgroundColor: "rgba(25, 118, 210, 0.05)",
        icon: MenuBookIcon,
        title: "Study Guide",
      };
    default:
      return null;
  }
}

/**
 * Parse a markdown line and return TextRun elements with formatting
 */
function parseMarkdownLine(line: string): TextRun[] {
  const runs: TextRun[] = [];

  // Pattern to match **bold**, *italic*, `code`, or plain text
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|[^*`]+)/g;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    const fullMatch = match[0];
    const bold = match[2];
    const italic = match[3];
    const code = match[4];

    if (bold) {
      runs.push(new TextRun({ text: bold, bold: true }));
    } else if (italic) {
      runs.push(new TextRun({ text: italic, italics: true }));
    } else if (code) {
      runs.push(new TextRun({
        text: code,
        font: "Courier New",
        shading: { fill: "E0E0E0" }
      }));
    } else if (fullMatch.trim()) {
      runs.push(new TextRun({ text: fullMatch }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: line })];
}

/**
 * Convert markdown content to DOCX and download
 */
async function downloadAsDocx(content: string, filename: string) {
  const lines = content.split('\n');
  const paragraphs: Paragraph[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();

    // Skip empty lines (add spacing)
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ text: "" }));
      i++;
      continue;
    }

    // Handle code blocks (```)
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++; // Skip opening ```
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // Skip closing ```

      // Add code block as formatted paragraphs
      codeLines.forEach(codeLine => {
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: codeLine,
            font: "Courier New",
            size: 20,
          })],
          shading: { fill: "F5F5F5" },
          spacing: { before: 100, after: 100 },
        }));
      });
      continue;
    }

    // Handle headings (# ## ###)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];

      let headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel];
      switch (level) {
        case 1: headingLevel = HeadingLevel.HEADING_1; break;
        case 2: headingLevel = HeadingLevel.HEADING_2; break;
        case 3: headingLevel = HeadingLevel.HEADING_3; break;
        case 4: headingLevel = HeadingLevel.HEADING_4; break;
        case 5: headingLevel = HeadingLevel.HEADING_5; break;
        default: headingLevel = HeadingLevel.HEADING_6;
      }

      paragraphs.push(new Paragraph({
        text: text,
        heading: headingLevel,
        spacing: { before: 240, after: 120 },
      }));
      i++;
      continue;
    }

    // Handle unordered lists (- or *)
    if (line.match(/^[-*]\s+(.+)$/)) {
      const text = line.replace(/^[-*]\s+/, '');
      paragraphs.push(new Paragraph({
        children: parseMarkdownLine(text),
        bullet: { level: 0 },
        spacing: { before: 100, after: 100 },
      }));
      i++;
      continue;
    }

    // Handle ordered lists (1. 2. etc.)
    if (line.match(/^\d+\.\s+(.+)$/)) {
      const text = line.replace(/^\d+\.\s+/, '');
      paragraphs.push(new Paragraph({
        children: parseMarkdownLine(text),
        numbering: { reference: "default-numbering", level: 0 },
        spacing: { before: 100, after: 100 },
      }));
      i++;
      continue;
    }

    // Regular paragraph with inline formatting
    paragraphs.push(new Paragraph({
      children: parseMarkdownLine(line),
      spacing: { before: 100, after: 100 },
    }));
    i++;
  }

  // Create document
  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs,
    }],
    numbering: {
      config: [{
        reference: "default-numbering",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.LEFT,
          },
        ],
      }],
    },
  });

  // Generate and download
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function extractBlocks(message: string) {
  const blocks: { type: "code" | "text"; value: string; language?: string }[] =
    [];
  const regex = /```(\w+)?\n([\s\S]*?)```/gm;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(message)) !== null) {
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
  if (lastIndex < message.length) {
    blocks.push({ type: "text", value: message.slice(lastIndex) });
  }
  return blocks;
}

type ChunkReference = {
  chunkId: string;
  displayNumber: number;
  pageNumber?: number;
};

type ChunkData = {
  chunkNumber: number;
  text: string;
  pageNumber?: number;
};

export type Citation = {
  href: string | null;
  text: string;
  docId?: string;
};

interface ChatItemProps {
  content: string;
  role: "user" | "assistant";
  messageIndex: number;
  onRetry?: (index: number) => void;
  versions?: string[];
  currentVersion?: number;
  reaction?: "like" | "dislike" | null;
  onSetReaction?: (idx: number, r: "like" | "dislike" | null) => void;
  citation?: Citation[];
  chunkReferences?: ChunkReference[];
  chunks?: ChunkData[];
  onCitationClick?: (chunkNumber: number) => void;
  onDocumentChat?: (docId: string) => void;
  isDocumentChat?: boolean;
}

/* ------------------------------
   SMALL UTILITY
   ------------------------------ */
const getDisplayText = (text: string): string => {
  const match = /^\d+_(.+)$/.exec(text);
  return match ? match[1] : text;
};

/* ------------------------------
   MARKDOWN RENDERER FOR POPUP
   ------------------------------ */
const MarkdownRender: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={{
      code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
        const langMatch = /language-(\w+)/.exec(className || "");
        return inline ? (
          <code
            className={className}
            style={{ background: "#eee", padding: "2px 4px", borderRadius: 4 }}
            {...props}
          >
            {children}
          </code>
        ) : (
          <SyntaxHighlighter
            style={coldarkDark as Record<string, React.CSSProperties>}          
            language={langMatch ? langMatch[1] : undefined}
            wrapLongLines
            customStyle={{ margin: 0, fontSize: 14 }}
            {...props}
          >
            {String(children).replace(/\n$/, "")}
          </SyntaxHighlighter>
        );
      },
      p: (props) => (
        <p style={{ margin: "0 0 0.5em 0" }} {...props} />
      ),
    }}
  >
    {text}
  </ReactMarkdown>
);

/* ------------------------------
   CITATION POP-UPS
   ------------------------------ */

const CitationPopup: React.FC<{
  anchorEl: HTMLElement | null;
  chunkText: string;
  onClose: () => void;
}> = ({ anchorEl, chunkText, onClose }) => (
  <Popper
    open={Boolean(anchorEl)}
    anchorEl={anchorEl}
    placement="bottom-start"
    modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
    sx={{ zIndex: (theme) => theme.zIndex.modal + 10 }}
  >
    <ClickAwayListener onClickAway={onClose}>
      <Box
        sx={{
          width: 320,
          maxHeight: 320,
          overflowY: "auto",
          bgcolor: "white",
          color: "black",
          p: 2,
          boxShadow: 8,
          borderRadius: 2,
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
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <MarkdownRender text={chunkText} />
      </Box>
    </ClickAwayListener>
  </Popper>
);

interface CitationOptionsPopupProps {
  anchorEl: HTMLElement | null;
  href: string;
  docId?: string;
  onClose: () => void;
  onDocumentChat: (docId: string) => void;
}

const CitationOptionsPopup: React.FC<CitationOptionsPopupProps> = ({
  anchorEl,
  href,
  docId,
  onClose,
  onDocumentChat,
}) => (
  <Popper
    open={Boolean(anchorEl)}
    anchorEl={anchorEl}
    placement="top-start"
    modifiers={[{ name: "offset", options: { offset: [0, -8] } }]}
    sx={{ zIndex: (theme) => theme.zIndex.modal + 10 }}
  >
    <ClickAwayListener onClickAway={onClose}>
      <Box
        sx={{
          bgcolor: "transparent",
          p: 0.5,
          boxShadow: 8,
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
        }}
      >
        <Button
          variant="contained"
          size="small"
          sx={{ fontSize: "0.64rem", py: 0.5, px: 1 }}
          onClick={() => {
            window.open(href, "_blank");
            onClose();
          }}
        >
          New Window
        </Button>
        {docId && (
          <Button
            variant="contained"
            size="small"
            sx={{ fontSize: "0.64rem", py: 0.5, px: 1 }}
            onClick={() => {
              onDocumentChat(docId);
              onClose();
            }}
          >
            Document Chat
          </Button>
        )}
      </Box>
    </ClickAwayListener>
  </Popper>
);

/* ------------------------------
   MAIN COMPONENT
   ------------------------------ */

const ChatItem: React.FC<ChatItemProps> = ({
  content,
  role,
  messageIndex,
  onRetry,
  versions = [],
  currentVersion = versions.length,
  reaction,
  onSetReaction,
  citation,
  chunkReferences,
  chunks,
  onCitationClick,
  onDocumentChat,
  isDocumentChat = false,
}) => {
  const auth = useAuth();

  /* ---------- pop-up states ---------- */
  const [chunkPopup, setChunkPopup] = useState<{
    anchorEl: HTMLElement | null;
    text: string;
  } | null>(null);

  const [optionsPopup, setOptionsPopup] = useState<{
    anchorEl: HTMLElement | null;
    href: string;
    docId?: string;
  } | null>(null);

  /* ---------- save dialog state ---------- */
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  // capture rendered message text (for copy)
  const messageBodyRef = useRef<HTMLDivElement | null>(null);

  const [localReaction, setLocalReaction] = useState<"like" | "dislike" | null>(
    reaction ?? null           // ← initialise from prop (DB value) if parent passes one
  );

  const [displayIdx, setDisplayIdx] = useState(currentVersion);
  // keep **at most two** versions: the first (versions[0]) and the latest (content)
  const allVersions = versions.length >= 2 ? versions.slice(0, 2) : [...versions, content];

  const displayContent = allVersions[displayIdx] || content;

  useEffect(() => { setDisplayIdx(currentVersion); }, [currentVersion]);

  // Detect response type for special formatting
  const responseType = role === "assistant" ? detectResponseType(displayContent) : "normal";
  const specialFormat = getSpecialFormatting(responseType);



  /* ---------- ensure only one item’s pop-ups stay open ---------- */
  const chatItemIdRef = useRef<string>(
    Math.random().toString(36).substring(2, 9)
  );
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail.chatItemId !== chatItemIdRef.current) {
        setChunkPopup(null);
        setOptionsPopup(null);
      }
    };
    window.addEventListener("citationPopupOpened", handler as EventListener);
    return () =>
      window.removeEventListener("citationPopupOpened", handler as EventListener);
  }, []);


  /* ---------- bracket reference click ---------- */
  const openChunkPopup = (anchorEl: HTMLElement, text: string) => {
    setChunkPopup({ anchorEl, text });
    window.dispatchEvent(
      new CustomEvent("citationPopupOpened", {
        detail: { chatItemId: chatItemIdRef.current },
      })
    );
  };

  /* ---------- split text & insert bracket links ---------- */
  function splitBrackets(str: string): React.ReactNode[] {
    const bracketRegex = /(\[\d+\])/g;
    const segments = str.split(bracketRegex);
    const result: React.ReactNode[] = [];

    segments.forEach((seg, i) => {
      if (bracketRegex.test(seg)) {
        const num = Number(seg.replace(/\D/g, ""));
        if (role !== "assistant") {
          // For user messages, render bracket numbers as plain text (not clickable)
          result.push(<span key={`br-${i}`}>{seg}</span>);
          return;
        }

        result.push(
          <span
            key={`br-${i}`}
            style={{ marginLeft: 4, color: "#1976d2", cursor: "pointer" }}
            onClick={async (e) => {
              e.stopPropagation();
              const el = e.currentTarget;

              if (chunkReferences?.length) {
                const ref = chunkReferences.find((c) => c.displayNumber === num);
                if (ref) {
                  try {
                    const data = await getChunkText(ref.chunkId);
                    openChunkPopup(el, data.text ?? "No text found");
                    onCitationClick?.(num);
                    return;
                  } catch {
                    /* ignore */
                  }
                }
              }
              if (chunks?.length) {
                const ep = chunks.find((c) => c.chunkNumber === num);
                if (ep) {
                  openChunkPopup(el, ep.text);
                  onCitationClick?.(num);
                  return;
                }
              }
              console.warn("No chunk found for", num);
            }}
          >
            {seg}
          </span>
        );
      } else {
        result.push(
          <ReactMarkdown
            key={`txt-${i}`}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              p: (props) => (
                <span
                  style={{
                    fontSize: 16,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                  {...props}
                />
              ),
            }}
          >
            {seg}
          </ReactMarkdown>
        );
      }
    });
    return result;
  }

  /* ---------- file citation click ---------- */
  const handleCitationClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    docId?: string
  ) => {
    e.preventDefault();
    setOptionsPopup({
      anchorEl: e.currentTarget,
      href,
      docId,
    });
    window.dispatchEvent(
      new CustomEvent("citationPopupOpened", {
        detail: { chatItemId: chatItemIdRef.current },
      })
    );
  };

  /* ---------- action icon handlers (stubbed) ---------- */
  const handleToggle = () => {
    setDisplayIdx((prev) => (prev + 1) % allVersions.length);
  };
  
  const handleCopy = () => {
    // Prefer copying what the user sees (rendered text, code, citation labels)
    const el = messageBodyRef.current;
    const textToCopy = el?.innerText?.trim() || displayContent;

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        console.log("Copied chat response to clipboard", {
          chars: textToCopy.length,
        });
      })
      .catch((err) => {
        console.error("Copy failed; falling back", err);
        try {
          // legacy fallback
          const ta = document.createElement("textarea");
          ta.value = textToCopy;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          console.log("Copied via execCommand fallback");
        } catch (fallbackErr) {
          console.error("Copy fallback failed", fallbackErr);
        }
      });
  };

  // 👍 like
  const handleThumbUp = () => {
    const next = localReaction === "like" ? null : "like";
    setLocalReaction(next);
    onSetReaction?.(messageIndex, next);   // let parent PATCH the DB
  };

  // 👎 dislike
  const handleThumbDown = () => {
    const next = localReaction === "dislike" ? null : "dislike";
    setLocalReaction(next);
    onSetReaction?.(messageIndex, next);
  };

  /* ---------- save and download handlers ---------- */
  const handleSaveClick = () => {
    const defaultName = specialFormat
      ? `Untitled ${specialFormat.title}`
      : "Untitled Document";
    setSaveName(defaultName);
    setSaveDialogOpen(true);
  };

  const handleSaveConfirm = () => {
    setSaveDialogOpen(false);
    toast.success("Saving to Saved Materials (Story 0.3 complete)");
  };

  const handleDownloadClick = async () => {
    // Sanitize filename from first 50 chars + timestamp
    const preview = displayContent.substring(0, 50).replace(/[^a-z0-9]/gi, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `${preview}_${timestamp}.docx`;

    try {
      await downloadAsDocx(displayContent, filename);
      toast.success("Downloaded successfully as DOCX");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download document");
    }
  };


  /* ---------- render ---------- */

  if (role === "assistant" && content.trim() === "") {
    const scale = isDocumentChat ? 0.5 : 1;
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          transform: `scale(${scale})`,
          transformOrigin: "left top",
          m: 1,
        }}
      >
        <Loader />
      </Box>
    );
  }

  const blocks = extractBlocks(displayContent);

  return (
    <Box
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
          fontSize: 14,
        }}
      >
        {role === "assistant"
          ? null
          : `${auth?.user?.name[0]}${auth?.user?.name.split(" ")[1][0]}`}
      </Avatar>

      {/* message body */}
      <Box
        ref={messageBodyRef}
        sx={{
          flex: 1,
          maxWidth: "100%",
          fontSize: 16,
          lineHeight: 1.6,
          ...(specialFormat && {
            position: "relative",
            borderLeft: "4px solid",
            borderLeftColor: specialFormat.borderColor,
            backgroundColor: specialFormat.backgroundColor,
            pl: 2,
            py: 1.5,
            pr: 1,
            borderRadius: 1,
          }),
        }}
      >
        {/* Special formatting icon */}
        {specialFormat && (
          <Box
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              color: specialFormat.borderColor,
              opacity: 0.7,
            }}
          >
            {React.createElement(specialFormat.icon, { fontSize: "small" })}
          </Box>
        )}

        {blocks.map((b, i) =>
          b.type === "code" ? (
            <SyntaxHighlighter
              key={i}
              style={coldarkDark as Record<string, React.CSSProperties>}
              language={b.language}
              customStyle={{
                width: "100%",
                boxSizing: "border-box",
                overflowX: "auto",
                fontSize: 15,
              }}
              wrapLongLines
              codeTagProps={{ style: { whiteSpace: "pre-wrap" } }}
              preTagProps={{
                style: { whiteSpace: "pre-wrap", margin: 0 },
              }}
            >
              {b.value.trim()}
            </SyntaxHighlighter>
          ) : (
            <Box key={i} sx={{ mb: 1, color: "white" }}>
              {splitBrackets(b.value)}
            </Box>
          )
        )}

        {role === "assistant" &&
          !isDocumentChat &&
          citation?.length &&
          citation.length > 0 && (
            <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
              {citation.map((c, idx) => (
                <a
                  key={idx}
                  href={c.href || "#"}
                  onClick={(e) =>
                    c.href &&
                    handleCitationClick(
                      e,
                      c.href,
                      typeof c.docId === "string" ? c.docId : undefined
                    )
                  }
                  style={{
                    display: "inline-block",
                    padding: "2px 6px",
                    border: "1px solid #1976d2",
                    borderRadius: 12,
                    color: "#1976d2",
                    textDecoration: "none",
                    fontSize: 14,
                    backgroundColor: "#e3f2fd",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {getDisplayText(c.text)}
                </a>
              ))}
            </Box>
          )}
          {/* action bar (assistant messages only) */}
          {role === "assistant" && content.trim() !== "" && (
            <Box
              sx={{
                mt: 1,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                color: "#9e9e9e",
              }}
            >
              {versions.length === 0 ? (
                /* still on first answer → show Retry */
                <IconButton
                  size="small"
                  onClick={() => onRetry?.(messageIndex)}
                  sx={{ color: "inherit", "&:hover": { color: "#fff" } }}
                >
                  <LoopIcon fontSize="small" />
                </IconButton>
              ) : (
                /* we have 2 versions → show toggle button */
                <IconButton
                  size="small"
                  onClick={handleToggle}
                  sx={{ color: "inherit", "&:hover": { color: "#fff" }, display: "flex", gap: 0.25 }}
                >
                  <Box component="span" sx={{ fontSize: 12 }}>{displayIdx + 1}</Box>
                  <SwapHorizIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton
                size="small"
                onClick={handleCopy}
                sx={{ color: "inherit", "&:hover": { color: "#fff" } }}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={handleThumbUp}
                sx={{ color: localReaction === "like" ? "#4caf50" : "inherit",
                      "&:hover": { color: "#fff" } }}
              >
                {localReaction === "like"
                  ? <ThumbUpIcon fontSize="small" />
                  : <ThumbUpOffAltIcon fontSize="small" />}
              </IconButton>

              <IconButton
                size="small"
                onClick={handleThumbDown}
                sx={{ color: localReaction === "dislike" ? "#f44336" : "inherit",
                      "&:hover": { color: "#fff" } }}
              >
                {localReaction === "dislike"
                  ? <ThumbDownIcon fontSize="small" />
                  : <ThumbDownOffAltIcon fontSize="small" />}
              </IconButton>
            </Box>
          )}

          {/* Save and Download buttons for special response types */}
          {role === "assistant" && specialFormat && (
            <Box sx={{ mt: 1.5, display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SaveIcon />}
                onClick={handleSaveClick}
                sx={{
                  color: "text.secondary",
                  borderColor: "divider",
                  textTransform: "none",
                  fontSize: 13,
                  "&:hover": {
                    borderColor: specialFormat.borderColor,
                    color: specialFormat.borderColor,
                  },
                }}
              >
                Save
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleDownloadClick}
                sx={{
                  color: "text.secondary",
                  borderColor: "divider",
                  textTransform: "none",
                  fontSize: 13,
                  "&:hover": {
                    borderColor: specialFormat.borderColor,
                    color: specialFormat.borderColor,
                  },
                }}
              >
                Download
              </Button>
            </Box>
          )}
      </Box>

      {/* --- pop-ups --- */}
      {chunkPopup && (
        <CitationPopup
          anchorEl={chunkPopup.anchorEl}
          chunkText={chunkPopup.text}
          onClose={() => setChunkPopup(null)}
        />
      )}

      {optionsPopup && (
        <CitationOptionsPopup
          anchorEl={optionsPopup.anchorEl}
          href={optionsPopup.href}
          docId={optionsPopup.docId}
          onClose={() => setOptionsPopup(null)}
          onDocumentChat={(id) => onDocumentChat?.(id)}
        />
      )}

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save as...</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            type="text"
            fullWidth
            variant="outlined"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveConfirm} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChatItem;
