import User from "../models/user.js";
import ChatSession from "../models/chatSession.js";
import Document from "../models/documents.js"; // Import Document model for citation text update
import axios from "axios";
export const createNewChatSession = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res.status(401).send("User not registered or token malfunctioned");
        }
        // Determine source
        const sourceHeader = req.headers["x-source"];
        const source = sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";
        // 1) Capture the requested chat session name
        let desiredName = req.body.name || "New Chat";
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
        });
        return res
            .status(201)
            .json({ message: "Chat session created", chatSession });
    }
    catch (error) {
        req.log.error(error);
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
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
export const generateChatCompletion = async (req, res, next) => {
    /* ---------- request body ---------- */
    const { message, class_name, docId, chatSessionId, ephemeral, retry } = req.body;
    const classNameForPython = class_name && class_name !== "null" ? class_name : null;
    const docIdForPython = docId && docId !== "null" ? docId : null;
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
            if (!currentUser.chatRequestResetAt ||
                now.getMonth() !== currentUser.chatRequestResetAt.getMonth() ||
                now.getFullYear() !== currentUser.chatRequestResetAt.getFullYear()) {
                currentUser.chatRequestCount = 0;
                currentUser.chatRequestResetAt = now;
            }
            if (currentUser.chatRequestCount >= 25) {
                return res.status(403).json({
                    message: "Free plan limit reached (25 chats/month). Upgrade to premium for unlimited chats.",
                });
            }
            // Consume one request
            currentUser.chatRequestCount += 1;
            await currentUser.save();
        }
        /* ================================================================== */
        /* ---------- session bookkeeping ---------- */
        const userId = currentUser._id;
        const sourceHeader = req.headers["x-source"];
        const source = sourceHeader === "chrome_extension" ? "chrome_extension" : "main_app";
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
            }
            else if (chatSession.source !== source) {
                return res.status(400).json({ message: "Chat session source mismatch" });
            }
        }
        else {
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
        if (classNameForPython)
            chatSession.assignedClass = classNameForPython;
        if (docIdForPython)
            chatSession.assignedDocument = docIdForPython;
        /* ---------- push user message ---------- */
        chatSession.messages.push({
            content: message,
            role: "user",
            citation: null,
            chunkReferences: [],
        });
        /* ---------- prepare FastAPI payload ---------- */
        const chats = chatSession.messages.map(({ role, content, citation, chunkReferences }) => ({
            role,
            content,
            citation,
            chunkReferences,
        }));
        const pythonApiUrl = process.env.PYTHON_API_URL;
        const semanticSearchEndpoint = `${pythonApiUrl}/api/v1/semantic_search`;
        const requestData = {
            user_id: userId.toString(),
            class_name: chatSession.assignedClass || "null",
            doc_id: chatSession.assignedDocument || "null",
            user_query: message,
            chat_history: chats,
            source,
        };
        /* ---------- call FastAPI ---------- */
        const responseFromPython = await axios.post(semanticSearchEndpoint, requestData, {
            headers: { 'X-Request-ID': req.id } // ← added
        });
        const resultMessage = responseFromPython.data;
        const aiResponse = resultMessage.message;
        let citation = resultMessage.citation;
        const chunks = resultMessage.chunks || [];
        /* ---------- build chunk references ---------- */
        const chunkReferences = chunks.map((c) => ({
            chunkId: c._id,
            displayNumber: c.chunkNumber,
            pageNumber: c.pageNumber ?? null,
            docId: c.docId ?? null,
        }));
        /* ---------- update citation text if single-document chat ---------- */
        if (chatSession.assignedDocument && citation && Array.isArray(citation)) {
            try {
                let doc = await Document.findOne({ docId: chatSession.assignedDocument });
                if (!doc)
                    doc = await Document.findById(chatSession.assignedDocument);
                if (doc) {
                    citation = citation.map((cit) => ({ ...cit, text: doc.fileName }));
                }
            }
            catch (docError) {
                req.log.warn({ err: docError, docId: chatSession.assignedDocument }, "Error fetching document for citation update");
            }
        }
        /* ---------- assistant response handling ---------- */
        if (retry === true) {
            // Find the last assistant message; it must exist because the preceding user
            // message we just pushed is its pair.
            const lastIdx = chatSession.messages.length - 2; // -1 = user just pushed
            if (lastIdx >= 0 && chatSession.messages[lastIdx].role === "assistant") {
                const prevMsg = chatSession.messages[lastIdx];
                // move current content into versions[]
                if (!prevMsg.versions)
                    prevMsg.versions = [prevMsg.content];
                prevMsg.versions.push(aiResponse);
                prevMsg.currentVersion = prevMsg.versions.length - 1;
                // overwrite displayed fields
                prevMsg.content = aiResponse;
                prevMsg.citation = citation;
                prevMsg.chunkReferences = chunkReferences;
            }
            else {
                // fallback: if for some reason we can't find it, just push
                chatSession.messages.push({
                    content: aiResponse,
                    role: "assistant",
                    citation,
                    chunkReferences,
                });
            }
        }
        else {
            // normal first response
            chatSession.messages.push({
                content: aiResponse,
                role: "assistant",
                citation,
                chunkReferences,
            });
        }
        await chatSession.save();
        /* ---------- respond to client ---------- */
        return res.status(200).json({
            chatSessionId: chatSession._id,
            messages: chatSession.messages,
            assignedClass: chatSession.assignedClass,
            assignedDocument: chatSession.assignedDocument,
            chunks,
        });
    }
    catch (error) {
        req.log.error(error);
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
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
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
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
//# sourceMappingURL=chat_controllers.js.map