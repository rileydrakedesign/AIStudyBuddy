import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { citationSchema } from "./chatSession.js";
const chatSchema = new mongoose.Schema({
    id: {
        type: String,
        default: randomUUID(),
    },
    role: {
        type: String,
        required: true,
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
    id: {
        type: String,
        default: randomUUID(),
    },
    name: {
        type: String,
        required: true,
        default: "New Chat",
    },
    messages: [chatSchema],
});
const classSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
});
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    classes: [classSchema],
});
export default mongoose.model("User", userSchema);
//# sourceMappingURL=user.js.map