import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  MenuItem,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Collapse,
  CircularProgress,
  Select,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import red from "@mui/material/colors/red";
import {
  ExpandLess,
  ExpandMore,
  Add as AddIcon,
  DeleteOutline as DeleteOutlineIcon,
  Edit as EditIcon,
  AccountCircle as AccountCircleIcon,
  ChatBubble as ChatBubbleIcon,
  Home as HomeIcon,
  Description as DescriptionIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import Logo from "../shared/Logo";
import toast from "react-hot-toast";
import { updateChatSession } from "../../helpers/api-communicators";

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
  chunkReferences?: ChunkReference[];
  versions?: string[];
  currentVersion?: number;
  reaction?: "like" | "dislike" | null;
};

type ChatSession = {
  _id: string;
  sessionName: string;
  messages: Message[];
  assignedClass?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ClassOption = {
  name: string;
  _id: string;
};

type DocumentItem = {
  _id: string;
  fileName: string;
  className: string;
  isProcessing?: boolean;
};

interface ChatSidebarProps {
  sidebarOpen: boolean;

  // Chat sessions
  chatSessions: ChatSession[];
  currentChatSessionId: string | null;
  onSelectChatSession: (id: string) => void;
  onDeleteChatSession: (id: string) => void;
  onCreateNewChatSession: () => void;
  isNamingChat: boolean;
  newChatName: string;
  onNewChatNameChange: (name: string) => void;
  onSubmitNewChatName: () => void;
  onCancelNewChat: () => void;
  onRenameChatSession: (id: string, newName: string) => void;

  // Classes
  classes: ClassOption[];
  selectedClass: string | null;
  onSelectClass: (className: string | null) => void;
  onCreateNewClass: () => void;

  // Documents
  classDocs: { [className: string]: DocumentItem[] };
  expandedClass: string | null;
  onToggleClass: (className: string) => void;
  onOpenDocumentChat: (docId: string) => void;
  onDeleteDocument: (docId: string, className: string) => void;
  onDeleteClass: (classId: string) => void;

  // UI state
  isGenerating: boolean;
  deletingChatIds: Set<string>;
  deletingDocIds: Set<string>;
  deletingClassIds: Set<string>;

  // User
  userEmail: string;
  userPlan: string;
  onNavigateToProfile: () => void;
}

/* Note: Some props are currently unused but kept for future functionality */

/* ------------------------------
   COMPONENT
------------------------------ */
/* eslint-disable @typescript-eslint/no-unused-vars */
const ChatSidebar: React.FC<ChatSidebarProps> = ({
  sidebarOpen,
  chatSessions,
  currentChatSessionId,
  onSelectChatSession,
  onDeleteChatSession,
  onCreateNewChatSession,
  isNamingChat,
  newChatName,
  onNewChatNameChange,
  onSubmitNewChatName,
  onCancelNewChat,
  onRenameChatSession,
  classes,
  selectedClass,
  onSelectClass,
  onCreateNewClass,
  classDocs,
  expandedClass: _expandedClass,
  onToggleClass,
  onOpenDocumentChat,
  onDeleteDocument,
  onDeleteClass,
  isGenerating,
  deletingChatIds: _deletingChatIds,
  deletingDocIds: _deletingDocIds,
  deletingClassIds: _deletingClassIds,
  userEmail,
  userPlan,
  onNavigateToProfile,
}) => {
  const navigate = useNavigate();

  // Local state for collapsible sections
  const [recentChatsExpanded, setRecentChatsExpanded] = useState(true);
  const [showAllRecentChats, setShowAllRecentChats] = useState(false);
  const [chatsExpanded, setChatsExpanded] = useState(true);
  const [documentsExpanded, setDocumentsExpanded] = useState(true);

  // State for editing chat names
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState("");

  // State for delete class confirmation dialog
  const [deleteClassDialogOpen, setDeleteClassDialogOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<{ id: string; name: string } | null>(null);

  // Helper: Get the actual class to display (fallback to first class if selectedClass is invalid)
  const getDisplayClass = (): string | null => {
    // If no classes, return null
    if (classes.length === 0) return null;

    // If selectedClass is valid, use it
    if (selectedClass && classes.some((cls) => cls.name === selectedClass)) {
      return selectedClass;
    }

    // Otherwise, use first class as fallback
    return classes[0].name;
  };

  const displayClass = getDisplayClass();

  // Fetch documents when class is selected
  useEffect(() => {
    if (displayClass && !classDocs[displayClass]) {
      onToggleClass(displayClass);
    }
  }, [displayClass, classDocs, onToggleClass]);

  // Notify parent if displayClass differs from selectedClass (auto-select first class)
  useEffect(() => {
    if (displayClass && displayClass !== selectedClass) {
      onSelectClass(displayClass);
    }
  }, [displayClass, selectedClass, onSelectClass]);

  // Get class badge color based on class name (simple hash-based color)
  const getClassColor = (className: string): string => {
    const colors = ["#1976d2", "#2e7d32", "#ed6c02", "#9c27b0", "#d32f2f"];
    const hash = className.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Get recent chats sorted by updatedAt
  const getRecentChats = () => {
    const sorted = [...chatSessions].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
    return showAllRecentChats ? sorted.slice(0, 10) : sorted.slice(0, 5);
  };

  // Get chats filtered by selected class
  const getClassScopedChats = () => {
    if (!displayClass) return [];
    return chatSessions.filter((session) => session.assignedClass === displayClass);
  };

  // Get documents for selected class
  const getClassScopedDocuments = () => {
    if (!displayClass) return [];
    return classDocs[displayClass] || [];
  };

  // Handle class selection from dropdown
  const handleClassSelect = (event: React.ChangeEvent<{ value: unknown }>) => {
    const value = event.target.value as string;
    if (value === "__new_class__") {
      onCreateNewClass();
      return;
    }
    onSelectClass(value === "null" ? null : value);
  };

  // Handle new chat button click - expand chats section and trigger naming
  const handleNewChatClick = () => {
    setChatsExpanded(true);
    onCreateNewChatSession();
  };

  // Handle edit chat name click
  const handleEditChatClick = (sessionId: string, currentName: string) => {
    setEditingChatId(sessionId);
    setEditingChatName(currentName);
  };

  // Handle save edited chat name (Enter or blur)
  const handleSaveEditedChatName = async (sessionId: string) => {
    if (!editingChatName.trim()) {
      setEditingChatId(null);
      setEditingChatName("");
      return;
    }

    try {
      // Update chat name via API
      await updateChatSession(sessionId, editingChatName.trim());

      // Update parent state via callback
      onRenameChatSession(sessionId, editingChatName.trim());

      setEditingChatId(null);
      setEditingChatName("");
      toast.success("Chat renamed successfully");
    } catch (error) {
      console.error("Error renaming chat:", error);
      toast.error("Failed to rename chat");
      setEditingChatId(null);
      setEditingChatName("");
    }
  };

  // Handle new chat naming input Enter key
  const handleNewChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (newChatName.trim()) {
        onSubmitNewChatName();
      } else {
        onCancelNewChat();
      }
    }
  };

  // Handle new chat naming input blur
  const handleNewChatBlur = () => {
    if (newChatName.trim()) {
      onSubmitNewChatName();
    } else {
      onCancelNewChat();
    }
  };

  // Handle edit chat name Enter key
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, sessionId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveEditedChatName(sessionId);
    } else if (e.key === "Escape") {
      setEditingChatId(null);
      setEditingChatName("");
    }
  };

  // Handle delete class click
  const handleDeleteClassClick = (classId: string, className: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent Select from closing
    setClassToDelete({ id: classId, name: className });
    setDeleteClassDialogOpen(true);
  };

  // Handle confirm delete class
  const handleConfirmDeleteClass = () => {
    if (classToDelete) {
      onDeleteClass(classToDelete.id);
      setDeleteClassDialogOpen(false);
      setClassToDelete(null);
    }
  };

  // Handle cancel delete class
  const handleCancelDeleteClass = () => {
    setDeleteClassDialogOpen(false);
    setClassToDelete(null);
  };

  return (
    <Box
      sx={{
        width: sidebarOpen ? "280px" : "70px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.4)",
        bgcolor: "rgba(0, 77, 86, 0.07)",
        backdropFilter: "blur(10px)",
        borderRight: "1px solid",
        borderColor: "divider",
        overflowY: "auto",
        overflowX: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        zIndex: 1300,
        transition: "width 250ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Logo at top of sidebar */}
      <Box
        sx={{
          p: sidebarOpen ? 3 : 1.5,
          display: "flex",
          justifyContent: sidebarOpen ? "flex-start" : "center",
        }}
      >
        {sidebarOpen ? (
          <Logo />
        ) : (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "8px",
              backgroundColor: "primary.main",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "1.25rem",
              boxShadow: "0 0 20px rgba(14, 165, 233, 0.4)",
            }}
          >
            AI
          </Box>
        )}
      </Box>

      {sidebarOpen && (
        <>
          {/* Recent Chats Section (TOP) */}
          <Box sx={{ px: 2, mb: 2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                mb: 1,
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.08)",
                },
                borderRadius: "8px",
                p: 1,
                transition: "background 300ms ease-in-out",
              }}
              onClick={() => setRecentChatsExpanded(!recentChatsExpanded)}
            >
              <Box sx={{ display: "flex", alignItems: "center" }}>
                {recentChatsExpanded ? <ExpandMore /> : <ExpandLess />}
                <Typography sx={{ ml: 1, fontWeight: 600, color: "text.primary" }}>
                  Recent Chats
                </Typography>
              </Box>
              <IconButton size="small" sx={{ color: "text.secondary" }}>
                <InfoIcon fontSize="small" />
              </IconButton>
            </Box>

            <Collapse in={recentChatsExpanded} timeout={300} unmountOnExit>
              <List disablePadding>
                {getRecentChats().length > 0 ? (
                  getRecentChats().map((session) => (
                    <ListItemButton
                      key={session._id}
                      className="chat-list-item"
                      selected={session._id === currentChatSessionId}
                      disabled={isGenerating}
                      onClick={() => onSelectChatSession(session._id)}
                      sx={{
                        borderRadius: "8px",
                        mb: 0.5,
                        "&.Mui-selected": {
                          bgcolor: "rgba(25, 118, 210, 0.2)",
                        },
                        transition: "background 300ms ease-in-out",
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ color: "text.primary", fontWeight: 500 }}
                        >
                          {session.sessionName}
                        </Typography>
                        {session.assignedClass && (
                          <Chip
                            label={session.assignedClass}
                            size="small"
                            sx={{
                              mt: 0.5,
                              height: 20,
                              fontSize: "0.7rem",
                              bgcolor: getClassColor(session.assignedClass),
                              color: "white",
                            }}
                          />
                        )}
                      </Box>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChatSession(session._id);
                        }}
                        sx={{
                          color: "red",
                          opacity: 0,
                          transition: "opacity 0.3s",
                          ".chat-list-item:hover &": { opacity: 1 },
                        }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </ListItemButton>
                  ))
                ) : (
                  <Typography
                    variant="body2"
                    sx={{ color: "text.secondary", textAlign: "center", py: 2 }}
                  >
                    No chats yet
                  </Typography>
                )}
              </List>

              {chatSessions.length > 5 && !showAllRecentChats && (
                <Button
                  fullWidth
                  size="small"
                  onClick={() => setShowAllRecentChats(true)}
                  sx={{
                    mt: 1,
                    color: "primary.main",
                    textTransform: "none",
                    fontSize: "0.875rem",
                  }}
                >
                  View More...
                </Button>
              )}
            </Collapse>
          </Box>

          {/* Divider */}
          <Box sx={{ borderTop: "1px solid", borderColor: "divider", mb: 2 }} />

          {/* Class Dropdown Selector or "Create First Class" */}
          {classes.length === 0 ? (
            <Box sx={{ px: 2, mb: 2 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={onCreateNewClass}
                sx={{
                  borderRadius: "8px",
                  borderColor: "primary.main",
                  color: "primary.main",
                  py: 1.5,
                  "&:hover": {
                    bgcolor: "rgba(25, 118, 210, 0.1)",
                    borderColor: "primary.dark",
                  },
                }}
              >
                Create Your First Class
              </Button>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mt: 1,
                  textAlign: "center",
                  color: "text.secondary",
                }}
              >
                Get started by creating a class to organize your study materials.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ px: 2, mb: 2 }}>
              <Select
                fullWidth
                value={displayClass || classes[0]?.name || ""}
                onChange={handleClassSelect}
                sx={{
                  borderRadius: "8px",
                  bgcolor: "background.paper",
                  "& .MuiSelect-select": {
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  },
                }}
              >
                {classes.map((cls) => (
                  <MenuItem
                    key={cls._id}
                    value={cls.name}
                    className="class-menu-item"
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      "&:hover .delete-class-btn": {
                        opacity: 1,
                      },
                    }}
                  >
                    <span>{cls.name}</span>
                    <IconButton
                      className="delete-class-btn"
                      size="small"
                      onClick={(e) => handleDeleteClassClick(cls._id, cls.name, e)}
                      sx={{
                        opacity: 0,
                        transition: "opacity 0.2s",
                        color: "error.main",
                        "&:hover": {
                          bgcolor: "rgba(211, 47, 47, 0.1)",
                        },
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </MenuItem>
                ))}
                <MenuItem value="__new_class__">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "primary.main" }}>
                    <AddIcon fontSize="small" />
                    New Class
                  </Box>
                </MenuItem>
              </Select>
            </Box>
          )}

          {/* Class-Scoped Sections (only show if a class is selected) */}
          {displayClass && (
            <>
              {/* Chats Section */}
              <Box sx={{ px: 2, mb: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    mb: 1,
                    "&:hover": {
                      bgcolor: "rgba(255, 255, 255, 0.08)",
                    },
                    borderRadius: "8px",
                    p: 1,
                    transition: "background 300ms ease-in-out",
                  }}
                  onClick={() => setChatsExpanded(!chatsExpanded)}
                >
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    {chatsExpanded ? <ExpandMore /> : <ExpandLess />}
                    <ChatBubbleIcon sx={{ ml: 1, mr: 1, fontSize: "1.2rem" }} />
                    <Typography sx={{ fontWeight: 600, color: "text.primary" }}>
                      Chats
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNewChatClick();
                    }}
                    sx={{ color: "primary.main" }}
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Box>

                <Collapse in={chatsExpanded} timeout={300} unmountOnExit>
                  <List disablePadding>
                    {/* New Chat Naming Input - shown as first item when naming */}
                    {isNamingChat && (
                      <ListItemButton
                        sx={{
                          borderRadius: "8px",
                          mb: 0.5,
                          pl: 3,
                          bgcolor: "rgba(25, 118, 210, 0.1)",
                        }}
                      >
                        <input
                          type="text"
                          value={newChatName}
                          onChange={(e) => onNewChatNameChange(e.target.value)}
                          onKeyDown={handleNewChatKeyDown}
                          onBlur={handleNewChatBlur}
                          placeholder="New chat name..."
                          autoFocus
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            border: "none",
                            outline: "none",
                            background: "transparent",
                            color: "#CBD5E1",
                            fontSize: "0.875rem",
                            fontFamily: "inherit",
                          }}
                        />
                      </ListItemButton>
                    )}

                    {getClassScopedChats().length > 0 ? (
                      getClassScopedChats().map((session) => (
                        <ListItemButton
                          key={session._id}
                          className="chat-list-item"
                          selected={session._id === currentChatSessionId}
                          disabled={isGenerating}
                          onClick={() => {
                            if (editingChatId !== session._id) {
                              onSelectChatSession(session._id);
                            }
                          }}
                          sx={{
                            borderRadius: "8px",
                            mb: 0.5,
                            pl: 3,
                            "&.Mui-selected": {
                              bgcolor: "rgba(25, 118, 210, 0.2)",
                            },
                            transition: "background 300ms ease-in-out",
                          }}
                        >
                          {editingChatId === session._id ? (
                            <input
                              type="text"
                              value={editingChatName}
                              onChange={(e) => setEditingChatName(e.target.value)}
                              onKeyDown={(e) => handleEditKeyDown(e, session._id)}
                              onBlur={() => handleSaveEditedChatName(session._id)}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: "100%",
                                padding: "6px 8px",
                                border: "none",
                                outline: "none",
                                background: "transparent",
                                color: "#CBD5E1",
                                fontSize: "0.875rem",
                                fontFamily: "inherit",
                              }}
                            />
                          ) : (
                            <ListItemText
                              primary={session.sessionName}
                              primaryTypographyProps={{
                                variant: "body2",
                                noWrap: true,
                                sx: { color: "text.primary" },
                              }}
                            />
                          )}
                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditChatClick(session._id, session.sessionName);
                              }}
                              sx={{
                                color: "primary.main",
                                opacity: 0,
                                transition: "opacity 0.3s",
                                ".chat-list-item:hover &": { opacity: 1 },
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteChatSession(session._id);
                              }}
                              sx={{
                                color: "red",
                                opacity: 0,
                                transition: "opacity 0.3s",
                                ".chat-list-item:hover &": { opacity: 1 },
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </ListItemButton>
                      ))
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{ color: "text.secondary", textAlign: "center", py: 2, pl: 3 }}
                      >
                        No chats for this class
                      </Typography>
                    )}
                  </List>
                </Collapse>
              </Box>

              {/* Documents Section */}
              <Box sx={{ px: 2, mb: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    mb: 1,
                    "&:hover": {
                      bgcolor: "rgba(255, 255, 255, 0.08)",
                    },
                    borderRadius: "8px",
                    p: 1,
                    transition: "background 300ms ease-in-out",
                  }}
                  onClick={() => setDocumentsExpanded(!documentsExpanded)}
                >
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    {documentsExpanded ? <ExpandMore /> : <ExpandLess />}
                    <DescriptionIcon sx={{ ml: 1, mr: 1, fontSize: "1.2rem" }} />
                    <Typography sx={{ fontWeight: 600, color: "text.primary" }}>
                      Documents
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/upload");
                    }}
                    sx={{ color: "primary.main" }}
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Box>

                <Collapse in={documentsExpanded} timeout={300} unmountOnExit>
                  <List disablePadding>
                    {getClassScopedDocuments().length > 0 ? (
                      getClassScopedDocuments().map((doc) => (
                        <ListItem key={doc._id} className="doc-list-item" sx={{ py: 0.5, pl: 3 }}>
                          <Button
                            disabled={isGenerating || doc.isProcessing}
                            onClick={() => onOpenDocumentChat(doc._id)}
                            sx={{
                              color: "#1976d2",
                              textTransform: "none",
                              justifyContent: "flex-start",
                              flex: 1,
                              minWidth: 0,
                              "&.Mui-disabled": {
                                color: "rgba(25,118,210, 0.5)",
                              },
                            }}
                          >
                            <Typography variant="body2" noWrap>
                              📄 {doc.fileName}
                            </Typography>
                          </Button>
                          {doc.isProcessing && (
                            <CircularProgress size={14} sx={{ ml: 1, color: "#90caf9" }} />
                          )}
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteDocument(doc._id, doc.className);
                            }}
                            sx={{
                              color: "red",
                              opacity: 0,
                              transition: "opacity 0.3s",
                              ".doc-list-item:hover &": { opacity: 1 },
                            }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </ListItem>
                      ))
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{ color: "text.secondary", textAlign: "center", py: 2, pl: 3 }}
                      >
                        No documents for this class
                      </Typography>
                    )}
                  </List>
                </Collapse>
              </Box>
            </>
          )}
        </>
      )}

      {/* Profile Section at Bottom */}
      <Box
        sx={{
          mt: "auto",
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          onClick={onNavigateToProfile}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: sidebarOpen ? 2 : 0,
            justifyContent: sidebarOpen ? "flex-start" : "center",
            cursor: "pointer",
            p: 1,
            borderRadius: "8px",
            transition: "background 150ms ease",
            "&:hover": {
              bgcolor: "rgba(255, 255, 255, 0.05)",
            },
          }}
        >
          <AccountCircleIcon sx={{ color: "primary.main", fontSize: 40 }} />
          {sidebarOpen && (
            <Box sx={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <Typography
                variant="body2"
                sx={{
                  color: "text.primary",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {userEmail}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  textTransform: "capitalize",
                }}
              >
                {userPlan} Plan
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Delete Class Confirmation Dialog */}
      <Dialog
        open={deleteClassDialogOpen}
        onClose={handleCancelDeleteClass}
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            borderRadius: "8px",
          },
        }}
      >
        <DialogTitle sx={{ color: "text.primary" }}>Delete Class</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "text.secondary" }}>
            Are you sure you want to delete the class <strong>"{classToDelete?.name}"</strong>?
          </DialogContentText>
          <DialogContentText sx={{ color: "text.secondary", mt: 2 }}>
            This action cannot be undone and will permanently delete:
          </DialogContentText>
          <Box component="ul" sx={{ color: "text.secondary", mt: 1, pl: 3 }}>
            <li>All documents in this class</li>
            <li>All chat sessions for this class</li>
            <li>All document content and embeddings</li>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCancelDeleteClass} sx={{ color: "text.secondary" }}>
            Cancel
          </Button>
          <Button onClick={handleConfirmDeleteClass} variant="contained" color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChatSidebar;
