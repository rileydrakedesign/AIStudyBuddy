import { NextFunction, Request, Response } from "express";
import User from "../models/user.js";
import ChatSession from "../models/chatSession.js";
import { execFile } from "child_process";

// Function to create a new chat session
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

    const chatSession = await ChatSession.create({
      userId: currentUser._id,
      sessionName: req.body.name || "New Chat",
      messages: [],
    });

    return res
      .status(201)
      .json({ message: "Chat session created", chatSession });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

// Function to get all chat sessions for the user
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

    const chatSessions = await ChatSession.find({ userId: currentUser._id });

    return res.status(200).json({ chatSessions });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};

// Function to generate chat completion (send a message in a chat session)
export const generateChatCompletion = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { message, class_name, chatSessionId } = req.body;

  try {
    // Fetch the current user
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .json({ message: "User not registered or token malfunctioned" });
    }

    const userId = currentUser._id;

    let chatSession;

    if (chatSessionId) {
      // Find the existing chat session for the user
      chatSession = await ChatSession.findOne({
        _id: chatSessionId,
        userId: userId,
      });

      if (!chatSession) {
        return res.status(404).json({ message: "Chat session not found" });
      }
    } else {
      // Create a new chat session if no chatSessionId is provided
      chatSession = new ChatSession({
        userId: userId,
        sessionName: "New Chat",
        messages: [],
      });
      // Save the new chat session to generate an _id
      await chatSession.save();
    }

    // Append the user's message to the chat session
    chatSession.messages.push({
      content: message,
      role: "user",
      citation: null,
    });

    // Prepare the chats array for the Python script
    const chats = chatSession.messages.map(({ role, content, citation }) => ({
      role,
      content,
      citation,
    }));

    // Call the Python script to process the chat
    const pythonPath = process.env.PYTHON_PATH;
    const scriptPath =
      "/Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts/semantic_search.py";

    // Log the paths and user ID for debugging
    console.log(`User ID: ${userId}`);

    const options = {
      env: {
        ...process.env,
        MONGO_CONNECTION_STRING: process.env.MONGO_CONNECTION_STRING,
      },
    };

    // Execute the Python script
    execFile(
      pythonPath,
      [
        scriptPath,
        userId.toString(),
        class_name,
        message,
        JSON.stringify(chats),
      ],
      options,
      async (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return res.status(500).json({ message: "Something went wrong" });
        }

        if (stderr) {
          console.error(`stderr: ${stderr}`); // Log stderr from Python script
        }

        // Parse the output from the Python script
        const resultMessage = JSON.parse(stdout.trim());

        const aiResponse = resultMessage.message;
        const citation = resultMessage.citation;

        // Append the assistant's response to the chat session
        chatSession.messages.push({
          content: aiResponse,
          role: "assistant",
          citation: citation,
        });

        // Save the updated chat session
        await chatSession.save();

        // Return the updated messages and the chat session ID
        return res.status(200).json({
          chatSessionId: chatSession._id,
          messages: chatSession.messages,
        });
      }
    );
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

// Function to delete a specific chat session
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

// Function to delete all chat sessions for the user
export const deleteAllChatSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // User token check
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .send("User not registered or token malfunctioned");
    }

    // Delete all chat sessions for the user
    await ChatSession.deleteMany({ userId: currentUser._id });

    return res.status(200).json({ message: "All chat sessions deleted" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};
