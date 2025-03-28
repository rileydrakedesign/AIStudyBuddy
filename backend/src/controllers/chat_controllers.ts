import { NextFunction, Request, Response } from "express";
import User from "../models/user.js";
import ChatSession from "../models/chatSession.js";
import Document from "../models/documents.js"; // Import Document model for citation text update
import { execFile } from "child_process";
import axios from "axios";

export const createNewChatSession = async (
  req,
  res,
  next
) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).send("User not registered or token malfunctioned");
    }

    // Determine source
    const sourceHeader = req.headers["x-source"];
    const source = sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";

    // Now extension can create new sessions as well
    const chatSession = await ChatSession.create({
      _id: req.body.chatSessionId ?? undefined,
      userId: currentUser._id,
      sessionName: req.body.name || "New Chat",
      messages: [],
      source,
    });

    return res
      .status(201)
      .json({ message: "Chat session created", chatSession });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

export const getUserChatSessions = async (
  req,
  res,
  next
) => {
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
      ephemeral: false,  // hide ephemeral
    };

    const chatSessions = await ChatSession.find(query);

    return res.status(200).json({ chatSessions });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

export const generateChatCompletion = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { message, class_name, docId, chatSessionId, ephemeral } = req.body;

  // Convert "null" or missing fields
  const classNameForPython = class_name && class_name !== "null" ? class_name : null;
  const docIdForPython = docId && docId !== "null" ? docId : null;

  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .json({ message: "User not registered or token malfunctioned" });
    }

    const userId = currentUser._id;
    const sourceHeader = req.headers["x-source"];
    const source = sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";

    let chatSession;

    // 1) If we have a chatSessionId, find or create that session
    if (chatSessionId && chatSessionId !== "null") {
      chatSession = await ChatSession.findOne({
        _id: chatSessionId,
        userId,
      });

      if (!chatSession) {
        // If not found, create a new one
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
          ephemeral: ephemeral === true,  // mark ephemeral if requested
        });
        await chatSession.save();
      } else {
        // If found, ensure there's no mismatch
        if (chatSession.source !== source) {
          return res.status(400).json({ message: "Chat session source mismatch" });
        }
      }
    } else {
      // 2) No chatSessionId => create a new session
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

    // If a class_name is provided, store it
    if (classNameForPython) {
      chatSession.assignedClass = classNameForPython;
    }

    // If docId is provided, store it
    if (docIdForPython) {
      chatSession.assignedDocument = docIdForPython;
    }

    // Append user message
    chatSession.messages.push({
      content: message,
      role: "user",
      citation: null,
      chunkReferences: [],  // user messages won't typically have chunk refs
    });

    // Prepare data for Python
    const chats = chatSession.messages.map(({ role, content, citation }) => ({
      role,
      content,
      citation,
    }));

    console.log(`User ID: ${userId}`);
    console.log(`Source: ${source}`);
    console.log(`Assigned Class: ${chatSession.assignedClass || "none"}`);
    console.log(`Assigned Document: ${chatSession.assignedDocument || "none"}`);
    console.log(`Ephemeral: ${chatSession.ephemeral}`);

    // NEW: Build the URL for the FastAPI endpoint
    const pythonApiUrl = process.env.PYTHON_API_URL; // e.g., "http://localhost:8000"
    const semanticSearchEndpoint = `${pythonApiUrl}/api/v1/semantic_search`;

    // NEW: Build the request data payload
    const requestData = {
      user_id: userId.toString(),
      class_name: chatSession.assignedClass || "null",
      doc_id: chatSession.assignedDocument || "null",
      user_query: message,
      chat_history: chats,
      source,
    };

    // NEW: Make an HTTP POST request to the FastAPI endpoint
    const responseFromPython = await axios.post(semanticSearchEndpoint, requestData);
    const resultMessage = responseFromPython.data;

    const aiResponse = resultMessage.message;
    let citation = resultMessage.citation;
    const chunks = resultMessage.chunks || [];

    // Build chunk references from the Python's 'chunks' array
    const chunkReferences = chunks.map((c: any) => ({
      chunkId: c._id,
      displayNumber: c.chunkNumber,
      pageNumber: c.pageNumber ?? null,
      docId: c.docId ?? null,
    }));

    // If chatSession has an assignedDocument, update citation text using fileName from MongoDB.
    if (chatSession.assignedDocument && citation && Array.isArray(citation)) {
      try {
        let doc = await Document.findOne({ docId: chatSession.assignedDocument });
        if (!doc) {
          // Fallback: if assignedDocument is a Mongo _id, try findById.
          doc = await Document.findById(chatSession.assignedDocument);
        }
        if (doc) {
          citation = citation.map((cit: any) => ({ ...cit, text: doc.fileName }));
        }
      } catch (docError) {
        console.error("Error fetching document for citation update:", docError);
      }
    }

    // Append assistant's response with updated citation and chunk references
    chatSession.messages.push({
      content: aiResponse,
      role: "assistant",
      citation,
      chunkReferences, // store them in the DB
    });

    await chatSession.save();

    return res.status(200).json({
      chatSessionId: chatSession._id,
      messages: chatSession.messages,
      assignedClass: chatSession.assignedClass,
      assignedDocument: chatSession.assignedDocument,
      chunks,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const deleteChatSession = async (
  req,
  res,
  next
) => {
  try {
    const { chatSessionId } = req.params;
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .send("User not registered or token malfunctioned");
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
    console.log(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

export const deleteAllChatSessions = async (
  req,
  res,
  next
) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .send("User not registered or token malfunctioned");
    }

    await ChatSession.deleteMany({ userId: currentUser._id });

    return res.status(200).json({ message: "All chat sessions deleted" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};
