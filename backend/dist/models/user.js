import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { citationSchema } from "./chatSession.js";
/* ---------- embedded chat/message schemas ---------- */
const chatSchema = new mongoose.Schema({
    id: { type: String, default: randomUUID() },
    role: { type: String, required: true },
    content: { type: String, required: true },
    citation: { type: [citationSchema], required: false },
});
const chatSessionSchema = new mongoose.Schema({
    id: { type: String, default: randomUUID() },
    name: { type: String, required: true, default: "New Chat" },
    messages: [chatSchema],
});
const classSchema = new mongoose.Schema({
    name: { type: String, required: true },
});
/* ---------- USER SCHEMA ---------- */
const userSchema = new mongoose.Schema({
    /* basic auth */
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    /* auth provider info */
    authProvider: {
        type: String,
        enum: ["credentials", "google"],
        default: "credentials",
    },
    googleId: { type: String },
    picture: { type: String },
    /* Password is required only for credentials-based accounts */
    password: {
        type: String,
        required: function () {
            return this.authProvider === "credentials";
        },
    },
    school: { type: String, required: false },
    /* mailgun email info */
    emailVerified: { type: Boolean, default: false },
    emailToken: { type: String },
    emailTokenExp: { type: Date },
    confirmEmailSentAt: { type: Date },
    /* password reset */
    passwordResetToken: { type: String },
    passwordResetExp: { type: Date },
    passwordResetSentAt: { type: Date },
    /* subscription / usage */
    plan: {
        type: String,
        enum: ["free", "premium"],
        default: "free",
    },
    chatRequestCount: {
        /* requests made in the current calendar month */
        type: Number,
        default: 0,
    },
    chatRequestResetAt: {
        /* last time the monthly counter was reset */
        type: Date,
        default: () => new Date(),
    },
    /* domain data */
    classes: [classSchema],
});
export default mongoose.model("User", userSchema);
//# sourceMappingURL=user.js.map