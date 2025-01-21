import mongoose from "mongoose";
import { randomUUID } from "crypto";
// Citation schema
export const citationSchema = new mongoose.Schema({
    href: {
        type: String,
        required: false,
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
    _id: {
        type: String, // existing code
        default: () => randomUUID(),
    },
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
    assignedClass: {
        type: String,
        default: null,
    },
    // === New field to store a single doc reference ===
    assignedDocument: {
        type: String,
        default: null,
    },
    source: {
        type: String,
        enum: ["main_app", "chrome_extension"],
        default: "main_app",
    },
}, {
    _id: false // tells Mongoose not to auto-generate an ObjectId
});
// If you want to ensure uniqueness, you can add an index:
chatSessionSchema.index({ _id: 1 }, { unique: true });
export default mongoose.model("ChatSession", chatSessionSchema);
//# sourceMappingURL=chatSession.js.map