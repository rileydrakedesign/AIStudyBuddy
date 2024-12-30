import mongoose from "mongoose";
import { randomUUID } from "crypto";
// Define the Citation schema
export const citationSchema = new mongoose.Schema({
    href: {
        type: String,
        required: false, // href can be null
    },
    text: {
        type: String,
        required: false,
    },
});
const messageSchema = new mongoose.Schema({
    id: {
        type: String,
        default: () => randomUUID(),
    },
    role: {
        type: String,
        required: true,
        enum: ["user", "assistant"],
    },
    content: {
        type: String,
        required: true,
    },
    citation: {
        type: [citationSchema],
        required: false,
    },
});
const chatSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    sessionName: {
        type: String,
        default: "New Chat",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    messages: [messageSchema],
    source: {
        type: String,
        enum: ["main_app", "chrome_extension"],
        default: "main_app",
    },
});
export default mongoose.model("ChatSession", chatSessionSchema);
//# sourceMappingURL=chatSession.js.map