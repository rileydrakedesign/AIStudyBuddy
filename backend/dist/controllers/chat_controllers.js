import user from "../models/user.js";
import { execFile } from 'child_process';
export const generateChatCompletion = async (req, res, next) => {
    const { message } = req.body;
    try {
        const currentUser = await user.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: "User not registered OR Token malfunctioned" });
        }
        const user_id = currentUser._id.toString();
        // Grab chats of user and append new message
        const chats = currentUser.chats.map(({ role, content, citation }) => ({
            role,
            content,
            citation
        }));
        chats.push({ content: message, role: "user", citation: null });
        // Call Python script to process the chat
        const pythonPath = process.env.PYTHON_PATH;
        const scriptPath = '/Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts/semantic_search.py';
        // Log the paths to ensure correctness
        /*
        console.log(`Python Path: ${pythonPath}`);
        console.log(`Script Path: ${scriptPath}`);
        console.log(`User ID: ${user_id}`);
        console.log(`Message: ${message}`);
        console.log(`Chats: ${JSON.stringify(chats)}`);
        */
        const options = {
            env: {
                ...process.env,
                MONGO_CONNECTION_STRING: process.env.MONGO_CONNECTION_STRING,
            }
        };
        // Execute Python script
        execFile(pythonPath, [scriptPath, user_id, message, JSON.stringify(chats)], options, async (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return res.status(500).json({ message: "Something went wrong" });
            }
            //remove extra chars
            const cleanedOutput = stdout.trim().replace(/^\(|\)$/g, '');
            //chats as json 
            const jsonChats = JSON.stringify(chats);
            // Parse the output from the Python script
            const result = JSON.parse(jsonChats);
            //parse stdout to get ai response
            const resultMessage = JSON.parse(stdout.trim());
            const aiResponse = resultMessage.message;
            const citation = resultMessage.citation;
            const chatHistory = resultMessage.chats;
            chats.push({ content: aiResponse, role: "assistant", citation: citation });
            // Update user's chat history
            chatHistory.push({ content: aiResponse, role: "assistant", citation: citation });
            console.log(chatHistory);
            currentUser.chats = chatHistory;
            // Save the updated user chat history
            await currentUser.save();
            // Return response with updated chat history
            return res.status(200).json({
                chats: [
                    ...chatHistory
                ]
            });
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};
export const sendChatsToUser = async (req, res, next) => {
    try {
        //user token check
        const currentUser = await user.findById(res.locals.jwtData.id);
        if (!user) {
            return res.status(401).send("User not registered OR Token malfunctioned");
        }
        if (currentUser._id.toString() !== res.locals.jwtData.id) {
            return res.status(401).send("Permissions didn't match");
        }
        return res.status(200).json({ message: "OK", chats: currentUser.chats });
    }
    catch (error) {
        console.log(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
export const deleteChats = async (req, res, next) => {
    try {
        //user token check
        const currentUser = await user.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res.status(401).send("User not registered OR Token malfunctioned");
        }
        if (currentUser._id.toString() !== res.locals.jwtData.id) {
            return res.status(401).send("Permissions didn't match");
        }
        //@ts-ignore
        currentUser.chats = [];
        await currentUser.save();
        return res.status(200).json({ message: "OK" });
    }
    catch (error) {
        console.log(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
//# sourceMappingURL=chat_controllers.js.map