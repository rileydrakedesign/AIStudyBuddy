
import { NextFunction, Request, Response } from "express";
import User from "../models/user.js";
import ChatSession from "../models/chatSession.js";
import { execFile } from "child_process";

export const createNewChatSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).send("User not registered or token malfunctioned");
    }

    // Determine source
    const sourceHeader = req.headers["x-source"];
    const source =
      sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";

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
    return res.status(500).json({ message: "ERROR", cause: (error as Error).message });
  }
};

export const getUserChatSessions = async (req: Request, res: Response, next: NextFunction) => {
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
      ephemeral: false,  // <--- Hide ephemeral
    };

    const chatSessions = await ChatSession.find(query);

    return res.status(200).json({ chatSessions });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "ERROR", cause: (error as Error).message });
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
    const source =
      sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";

    let chatSession;

    // 1) If we have a chatSessionId, find or create that session
    if (chatSessionId && chatSessionId !== "null") {
      chatSession = await ChatSession.findOne({
        _id: chatSessionId,
        userId,
      });

      if (!chatSession) {
        // If not found, create
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
        // If found, check mismatch
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

    const pythonPath = process.env.PYTHON_PATH;
    const scriptPath =
      "/Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts/semantic_search.py";

    const options = {
      env: {
        ...process.env,
        MONGO_CONNECTION_STRING: process.env.MONGO_CONNECTION_STRING,
      },
    };

    execFile(
      pythonPath,
      [
        scriptPath,
        userId.toString(),
        chatSession.assignedClass || "null",
        chatSession.assignedDocument || "null",
        message,
        JSON.stringify(chats),
        source,
      ],
      options,
      async (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return res.status(500).json({ message: "Something went wrong" });
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
        }

        let resultMessage;
        try {
          resultMessage = JSON.parse(stdout.trim());
        } catch (parseError) {
          console.error("Error parsing Python script output:", parseError);
          return res
            .status(500)
            .json({ message: "Invalid response from backend" });
        }

        const aiResponse = resultMessage.message;
        const citation = resultMessage.citation;
        const chunks = resultMessage.chunks || [];

        // Append assistant's response
        chatSession.messages.push({
          content: aiResponse,
          role: "assistant",
          citation,
        });

        await chatSession.save();

        return res.status(200).json({
          chatSessionId: chatSession._id,
          messages: chatSession.messages,
          assignedClass: chatSession.assignedClass,
          assignedDocument: chatSession.assignedDocument,
          chunks,
        });
      }
    );
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const deleteChatSession = async (
  req: Request,
  res: Response,
  next: NextFunction
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
    return res.status(500).json({ message: "ERROR", cause: (error as Error).message });
  }
};

export const deleteAllChatSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
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
    return res.status(500).json({ message: "ERROR", cause: (error as Error).message });
  }
};
