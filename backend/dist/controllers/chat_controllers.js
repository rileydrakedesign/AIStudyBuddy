import User from "../models/user.js";
import ChatSession from "../models/chatSession.js";
import { execFile } from "child_process";
// Function to create a new chat session
export const createNewChatSession = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res.status(401).send("User not registered or token malfunctioned");
        }
        // Determine the source from headers
        const sourceHeader = req.headers["x-source"];
        const source = sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";
        // If request is from the extension, do NOT create a brand-new session
        // (We want only a single "Extension Chat" session, so return 403 here or skip this route)
        if (source === "chrome_extension") {
            return res.status(403).json({
                message: "Cannot create new chat session from Chrome extension.",
            });
        }
        // Otherwise, create a new session for the main app
        const chatSession = await ChatSession.create({
            userId: currentUser._id,
            sessionName: req.body.name || "New Chat",
            messages: [],
            source, // 'main_app'
        });
        return res.status(201).json({ message: "Chat session created", chatSession });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
// Function to get all chat sessions for the user
export const getUserChatSessions = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res.status(401).send("User not registered or token malfunctioned");
        }
        // Determine if this request is from the extension
        const sourceHeader = req.headers["x-source"];
        const isExtension = sourceHeader === "chrome_extension";
        // If request is from the extension => filter for 'chrome_extension' sessions
        // Otherwise (main app or no header), filter for 'main_app'
        const query = {
            userId: currentUser._id,
            source: isExtension ? "chrome_extension" : "main_app",
        };
        const chatSessions = await ChatSession.find(query);
        return res.status(200).json({ chatSessions });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
// Function to generate chat completion (send a message in a chat session)
export const generateChatCompletion = async (req, res, next) => {
    const { message, class_name, chatSessionId } = req.body;
    const classNameForPython = class_name && class_name !== "null" ? class_name : "null";
    try {
        // Fetch the current user
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: "User not registered or token malfunctioned" });
        }
        const userId = currentUser._id;
        // Determine the source of the request
        const sourceHeader = req.headers["x-source"];
        const source = sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";
        let chatSession;
        if (chatSessionId) {
            // Find the existing chat session for the user
            chatSession = await ChatSession.findOne({
                _id: chatSessionId,
                userId,
            });
            if (!chatSession) {
                return res.status(404).json({ message: "Chat session not found" });
            }
            // Ensure the existing session matches the source
            if (chatSession.source !== source) {
                return res
                    .status(400)
                    .json({ message: "Chat session source mismatch" });
            }
        }
        else {
            // No chatSessionId provided
            if (source === "chrome_extension") {
                // Attempt to find a single, existing "chrome_extension" session
                chatSession = await ChatSession.findOne({
                    userId,
                    source: "chrome_extension",
                });
                if (!chatSession) {
                    // Create a single extension chat session if none exists
                    chatSession = await ChatSession.create({
                        userId,
                        sessionName: "Extension Chat",
                        messages: [],
                        source: "chrome_extension",
                    });
                }
            }
            else {
                // If from main app => create a new session
                chatSession = new ChatSession({
                    userId,
                    sessionName: "New Chat",
                    messages: [],
                    source: "main_app",
                });
                await chatSession.save();
            }
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
        // Log for debugging
        console.log(`User ID: ${userId}`);
        console.log(`Source: ${source}`);
        const pythonPath = process.env.PYTHON_PATH;
        const scriptPath = "/Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts/semantic_search.py";
        const options = {
            env: {
                ...process.env,
                MONGO_CONNECTION_STRING: process.env.MONGO_CONNECTION_STRING,
            },
        };
        // Execute the Python script
        execFile(pythonPath, [
            scriptPath,
            userId.toString(),
            classNameForPython,
            message,
            JSON.stringify(chats),
            source, // Pass the source as the fifth argument
        ], options, async (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return res.status(500).json({ message: "Something went wrong" });
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
            }
            // Parse the output from the Python script
            let resultMessage;
            try {
                resultMessage = JSON.parse(stdout.trim());
            }
            catch (parseError) {
                console.error("Error parsing Python script output:", parseError);
                return res
                    .status(500)
                    .json({ message: "Invalid response from backend" });
            }
            const aiResponse = resultMessage.message;
            const citation = resultMessage.citation;
            // Append the assistant's response
            chatSession.messages.push({
                content: aiResponse,
                role: "assistant",
                citation,
            });
            // Save the updated session
            await chatSession.save();
            // Return the updated messages and the chatSessionId
            return res.status(200).json({
                chatSessionId: chatSession._id,
                messages: chatSession.messages,
            });
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};
// Function to delete a specific chat session
export const deleteChatSession = async (req, res, next) => {
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
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
// Function to delete all chat sessions for the user
export const deleteAllChatSessions = async (req, res, next) => {
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
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
//# sourceMappingURL=chat_controllers.js.map