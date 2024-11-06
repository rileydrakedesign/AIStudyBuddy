import mongoose from "mongoose";
import { randomUUID } from "crypto";
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
        type: [String],
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
});
export default mongoose.model("ChatSession", chatSessionSchema);
//# sourceMappingURL=chatSession.js.map