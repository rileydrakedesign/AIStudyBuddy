// controllers/chat_controllers.js

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
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

export const getUserChatSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).send("User not registered or token malfunctioned");
    }

    const sourceHeader = req.headers["x-source"];
    const isExtension = sourceHeader === "chrome_extension";

    const query = {
      userId: currentUser._id,
      source: isExtension ? "chrome_extension" : "main_app",
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
  const { message, class_name, chatSessionId } = req.body;
  const classNameForPython =
    class_name && class_name !== "null" ? class_name : null;

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

    if (chatSessionId) {
      // Attempt to find with string _id
      chatSession = await ChatSession.findOne({
        _id: chatSessionId,
        userId,
      });

      if (!chatSession) {
        // If not found, create a new doc with that string ID
        chatSession = new ChatSession({
          _id: chatSessionId,
          userId,
          sessionName: source === "chrome_extension" ? "Extension Chat" : "New Chat",
          messages: [],
          source,
        });
        await chatSession.save();
      } else {
        // If found, check source match
        if (chatSession.source !== source) {
          return res
            .status(400)
            .json({ message: "Chat session source mismatch" });
        }
      }
    } else {
      // No chatSessionId => always create a new session
      chatSession = new ChatSession({
        userId,
        sessionName: source === "chrome_extension" ? "Extension Chat" : "New Chat",
        messages: [],
        source,
      });
      await chatSession.save();
    }

    // If a class_name is provided, store it
    if (classNameForPython) {
      chatSession.assignedClass = classNameForPython;
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

        // Return chunks as well so the frontend can handle them
        return res.status(200).json({
          chatSessionId: chatSession._id,
          messages: chatSession.messages,
          assignedClass: chatSession.assignedClass,
          chunks: chunks,
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
    return res.status(500).json({ message: "ERROR", cause: error.message });
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
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};
