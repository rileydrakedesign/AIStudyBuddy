import { NextFunction, Request, Response } from "express";
import User from "../models/user.js";
import ChatSession from "../models/chatSession.js";
import Document from "../models/documents.js"; // Import Document model for citation text update
import { execFile } from "child_process";
import axios from "axios";
import { io } from "../utils/socket_server.js";

export const createNewChatSession = async (req, res, next) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).send("User not registered or token malfunctioned");
    }

    // Determine source
    const sourceHeader = req.headers["x-source"];
    const source = sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";

    // 1) Capture the requested chat session name and optional class
    let desiredName = req.body.name || "New Chat";
    const assignedClass = req.body.assignedClass || null;

    // 2) Check if any existing chat session has the exact same name
    //    or the same name with a numeric suffix (e.g., "New Chat (1)").
    //    We use a case-insensitive regex to match:
    //       ^DESIRED_NAME(\s\(\d+\))?$   (meaning: exactly DESIRED_NAME or DESIRED_NAME (someNumber))
    const existingSessions = await ChatSession.find({
      userId: currentUser._id,
      sessionName: {
        $regex: new RegExp(`^${desiredName}( \\(\\d+\\))?$`, "i"),
      },
    });

    if (existingSessions.length > 0) {
      // Find highest suffix or detect an exact match
      let highestSuffix = 0;

      existingSessions.forEach((session) => {
        // If there's an exact match (case-insensitive), let highestSuffix remain >= 0
        if (session.sessionName.toLowerCase() === desiredName.toLowerCase()) {
          if (highestSuffix === 0) {
            highestSuffix = 0;
          }
        }
        // If there's a suffix like "My Chat (3)", extract the "3"
        const match = session.sessionName.match(/\((\d+)\)$/);
        if (match) {
          const suffixNum = parseInt(match[1], 10);
          if (suffixNum > highestSuffix) {
            highestSuffix = suffixNum;
          }
        }
      });

      // Finally, append (highestSuffix + 1) if there's any collision
      desiredName = `${desiredName} (${highestSuffix + 1})`;
    }

    // 3) Create the new session with the possibly adjusted name
    const chatSession = await ChatSession.create({
      _id: req.body.chatSessionId ?? undefined,
      userId: currentUser._id,
      sessionName: desiredName,
      messages: [],
      source,
      assignedClass,
    });

    return res
      .status(201)
      .json({ message: "Chat session created", chatSession });
  } catch (error) {
    (req as any).log.error(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

export const getUserChatSessions = async (req, res, next) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).send("User not registered or token malfunctioned");
    }

    const sourceHeader = req.headers["x-source"];
    const isExtension = sourceHeader === "chrome_extension";

    // Filter out ephemeral sessions
    const query = {
      userId: currentUser._id,
      source: isExtension ? "chrome_extension" : "main_app",
      ephemeral: false, // hide ephemeral
    };

    const chatSessions = await ChatSession.find(query);
    return res.status(200).json({ chatSessions });
  } catch (error) {
    (req as any).log.error(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

export const updateChatSession = async (req, res, next) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).send("User not registered or token malfunctioned");
    }

    const { chatSessionId } = req.params;
    const { sessionName } = req.body;

    if (!sessionName || !sessionName.trim()) {
      return res.status(400).json({ message: "Session name is required" });
    }

    // Find the chat session
    const chatSession = await ChatSession.findOne({
      _id: chatSessionId,
      userId: currentUser._id,
    });

    if (!chatSession) {
      return res.status(404).json({ message: "Chat session not found" });
    }

    // Update the session name
    chatSession.sessionName = sessionName.trim();
    await chatSession.save();

    return res.status(200).json({
      message: "Chat session updated",
      chatSession
    });
  } catch (error) {
    (req as any).log.error(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

export const generateChatCompletion = async (req, res, next) => {
  /* ---------- request body ---------- */
  const { message, class_name, docId, chatSessionId, ephemeral, retry } = req.body;
  const classNameForPython = class_name && class_name !== "null" ? class_name : null;
  const docIdForPython     = docId      && docId      !== "null" ? docId      : null;

  try {
    /* ---------- AUTH ---------- */
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).json({ message: "User not registered or token malfunctioned" });
    }

    /* ==================================================================
       FREE-TIER LIMIT  (NEW)
    ================================================================== */
    if (currentUser.plan === "free") {
      const now = new Date();

      // Reset monthly counter if month/year rolled over
      if (
        !currentUser.chatRequestResetAt ||
        now.getMonth()   !== currentUser.chatRequestResetAt.getMonth() ||
        now.getFullYear() !== currentUser.chatRequestResetAt.getFullYear()
      ) {
        currentUser.chatRequestCount   = 0;
        currentUser.chatRequestResetAt = now;
      }

      if (currentUser.chatRequestCount >= 25) {
        return res.status(403).json({
          message: "Free plan limit reached (25 chats/month). Upgrade to premium for unlimited chats.",
        });
      }

      // Defer incrementing until after successful stream completion
      // (will be incremented in stream.on('end') handler)
    }
    /* ================================================================== */

    /* ---------- session bookkeeping ---------- */
    const userId       = currentUser._id;
    const sourceHeader = req.headers["x-source"];
    const source       = sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";

    let chatSession;

    // 1)  If chatSessionId provided, find or create it
    if (chatSessionId && chatSessionId !== "null") {
      chatSession = await ChatSession.findOne({ _id: chatSessionId, userId });

      if (!chatSession) {
        chatSession = new ChatSession({
          _id: chatSessionId,
          userId,
          sessionName: docIdForPython
            ? "Document Chat"
            : source === "chrome_extension"
            ? "Extension Chat"
            : "New Chat",
          messages: [],
          source,
          ephemeral: ephemeral === true,
        });
        await chatSession.save();
      } else if (chatSession.source !== source) {
        return res.status(400).json({ message: "Chat session source mismatch" });
      }
    } else {
      // 2) Create a new session
      chatSession = new ChatSession({
        userId,
        sessionName: docIdForPython
          ? "Document Chat"
          : source === "chrome_extension"
          ? "Extension Chat"
          : "New Chat",
        messages: [],
        source,
        ephemeral: ephemeral === true || !!docIdForPython,
      });
      await chatSession.save();
    }

    // Store class/document references if supplied
    if (classNameForPython) chatSession.assignedClass = classNameForPython;
    if (docIdForPython)     chatSession.assignedDocument = docIdForPython;

    /* ---------- push user message ---------- */
    if (!retry) {                             // ⬅︎ only on first ask
      chatSession.messages.push({
        content: message,
        role: "user",
        citation: null,
        chunkReferences: [],
      });
    }

    /* ---------- prepare FastAPI payload ---------- */
    const chats = chatSession.messages.map(({ role, content, citation, chunkReferences }) => ({
      role,
      content,
      citation,
      chunkReferences,
    }));

    // Use DEV URL if available (local development), otherwise use production URL
    (req as any).log.debug({
      PYTHON_API_URL_DEV: process.env.PYTHON_API_URL_DEV,
      PYTHON_API_URL: process.env.PYTHON_API_URL,
    }, "Python API URL environment variables");
    const pythonApiUrl = process.env.PYTHON_API_URL_DEV || process.env.PYTHON_API_URL;
    (req as any).log.debug({ pythonApiUrl }, "Selected Python API URL");
    const streamEndpoint = `${pythonApiUrl}/api/v1/semantic_search_stream`;

    const requestData = {
      user_id:   userId.toString(),
      class_name: chatSession.assignedClass   || "null",
      doc_id:     chatSession.assignedDocument || "null",
      user_query: message,
      chat_history: chats,
      source,
    };

    /* ---------- STREAMING: call FastAPI and proxy to WebSocket ---------- */
    const shouldIncrementFreeTierCount = currentUser.plan === "free";
    const userRoom = userId.toString();

    let fullResponse = "";
    let citations: any = null;
    let chunkReferences: any = [];
    let streamError: string | null = null;

    try {
      (req as any).log.info({ streamEndpoint, userId: userId.toString() }, "Starting Python streaming request");

      const pythonStream = await axios.post(streamEndpoint, requestData, {
        responseType: 'stream',
        headers: { 'X-Request-ID': (req as any).id }
      });

      (req as any).log.info("Python stream initiated, setting up event handlers");

      let tokenCount = 0;
      let keepaliveCount = 0;

      // Parse SSE events and emit to WebSocket
      pythonStream.data.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split('\n').filter((line: string) => line.trim().startsWith('data:'));

        lines.forEach((line: string) => {
          try {
            const jsonStr = line.replace('data:', '').trim();
            if (!jsonStr) return;

            const event = JSON.parse(jsonStr);

            if (event.type === 'token') {
              tokenCount++;
              if (tokenCount === 1) {
                (req as any).log.info("Received first token from Python");
              }
              // Emit token to user's WebSocket room
              io.to(userRoom).emit('chat-stream-token', {
                sessionId: chatSession._id.toString(),
                token: event.content
              });
              fullResponse += event.content;

            } else if (event.type === 'done') {
              (req as any).log.info({ tokenCount }, "Received done event from Python");
              // Store citations and chunk references for later processing
              citations = event.citations;
              chunkReferences = event.chunkReferences || [];

            } else if (event.type === 'error') {
              // Python error
              (req as any).log.error({ message: event.message }, "Received error event from Python");
              streamError = event.message;

            } else if (event.type === 'keepalive') {
              keepaliveCount++;
              if (keepaliveCount % 10 === 1) {
                (req as any).log.debug({ keepaliveCount }, "Received keepalive from Python");
              }
              // Ignore keepalive events (just prevent timeout)
            }
          } catch (parseError) {
            (req as any).log.warn({ err: parseError, line }, "Failed to parse SSE event");
          }
        });
      });

      pythonStream.data.on('end', async () => {
        (req as any).log.info({ streamError, hasCitations: !!citations }, "Python stream ended");

        if (streamError) {
          // Stream failed - emit error and don't save
          (req as any).log.error({ streamError }, "Stream failed with error");
          io.to(userRoom).emit('chat-stream-error', {
            sessionId: chatSession._id.toString(),
            error: streamError
          });
          return res.status(500).json({ message: streamError });
        }

        /* ---------- update citation text if single-document chat ---------- */
        if (chatSession.assignedDocument && citations && Array.isArray(citations)) {
          try {
            let doc = await Document.findOne({ docId: chatSession.assignedDocument });
            if (!doc) doc = await Document.findById(chatSession.assignedDocument);

            if (doc) {
              citations = citations.map((cit: any) => ({ ...cit, text: doc.fileName }));
            }
          } catch (docError) {
            (req as any).log.warn(
              { err: docError, docId: chatSession.assignedDocument },
              "Error fetching document for citation update"
            );
          }
        }

        /* ---------- assistant response handling ---------- */
        if (retry === true) {
          const lastIdx = chatSession.messages.length - 2;
          if (lastIdx >= 0 && chatSession.messages[lastIdx].role === "assistant") {
            const prevMsg = chatSession.messages[lastIdx];

            // move current content into versions[]
            if (!prevMsg.versions) prevMsg.versions = [prevMsg.content];
            prevMsg.versions.push(fullResponse);
            prevMsg.currentVersion = prevMsg.versions.length - 1;

            // overwrite displayed fields
            prevMsg.content         = fullResponse;
            prevMsg.citation        = citations;
            prevMsg.chunkReferences = chunkReferences;
          } else {
            // fallback
            chatSession.messages.push({
              content: fullResponse,
              role: "assistant",
              citation: citations,
              chunkReferences: chunkReferences,
            });
          }
        } else {
          // normal first response
          chatSession.messages.push({
            content: fullResponse,
            role: "assistant",
            citation: citations,
            chunkReferences: chunkReferences,
          });
        }

        // Save to MongoDB ONLY after stream completes
        await chatSession.save();

        // Increment free tier count ONLY after successful stream
        if (shouldIncrementFreeTierCount) {
          currentUser.chatRequestCount += 1;
          await currentUser.save();
        }

        // Emit completion event to WebSocket
        io.to(userRoom).emit('chat-stream-complete', {
          sessionId: chatSession._id.toString(),
          citations: citations,
          chunkReferences: chunkReferences
        });

        /* ---------- respond to client ---------- */
        return res.status(200).json({
          chatSessionId:   chatSession._id,
          messages:        chatSession.messages,
          assignedClass:   chatSession.assignedClass,
          assignedDocument: chatSession.assignedDocument,
        });
      });

      pythonStream.data.on('error', (error: any) => {
        (req as any).log.error({ err: error }, "Python stream error");
        io.to(userRoom).emit('chat-stream-error', {
          sessionId: chatSession._id.toString(),
          error: error.message
        });
        return res.status(500).json({ message: "Stream failed" });
      });

    } catch (streamInitError) {
      (req as any).log.error({ err: streamInitError }, "Failed to initiate stream");
      return res.status(500).json({ message: "Failed to start stream" });
    }
  } catch (error) {
    (req as any).log.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};


export const deleteChatSession = async (req, res, next) => {
  try {
    const { chatSessionId } = req.params;
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).send("User not registered or token malfunctioned");
    }

    const chatSession = await ChatSession.findOneAndDelete({
      _id: chatSessionId,
      userId: currentUser._id,
    });

    if (!chatSession) {
      return res.status(404).json({ message: "Chat session not found" });
    }

    return res.status(200).json({ message: "Chat session deleted" });
  } catch (error) {
    (req as any).log.error(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

// controllers/chat_controllers.ts
export const setMessageReaction = async (req, res) => {
  try {
    const { sessionId, msgIndex } = req.params;
    const { reaction }           = req.body;          // "like" | "dislike" | null
    if (!["like", "dislike", null].includes(reaction))
      return res.status(400).json({ message: "Invalid reaction value" });

    const chat = await ChatSession.findOne({
      _id:     sessionId,
      userId:  res.locals.jwtData.id,
      source:  "main_app",
    });
    if (!chat) return res.status(404).send("Chat session not found");

    if (msgIndex < 0 || msgIndex >= chat.messages.length)
      return res.status(400).send("Bad message index");

    chat.messages[msgIndex].reaction = reaction;
    await chat.save();

    return res.status(200).json({ ok: true, reaction });
  } catch (err) {
    (req as any).log.error(err);
    return res.status(500).json({ message: "ERROR", cause: err.message });
  }
};


export const deleteAllChatSessions = async (req, res, next) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).send("User not registered or token malfunctioned");
    }

    await ChatSession.deleteMany({ userId: currentUser._id });

    return res.status(200).json({ message: "All chat sessions deleted" });
  } catch (error) {
    (req as any).log.error(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};
