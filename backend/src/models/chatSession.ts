import mongoose from "mongoose";
import { randomUUID } from "crypto";

// Citation schema
export const citationSchema = new mongoose.Schema({
  href: { type: String, required: false },
  text: { type: String, required: false },
  docId: { type: String, required: false },
});

// Chunk reference schema (NEW)
const chunkReferenceSchema = new mongoose.Schema({
  chunkId: { type: String, required: false },
  displayNumber: { type: Number, required: false },
  pageNumber: { type: Number, required: false },
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
  // NEW FIELD to store chunk references without storing full text
  chunkReferences: {
    type: [chunkReferenceSchema],
    required: false,
    default: [],
  },
});

const chatSessionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
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
    assignedDocument: {
      type: String,
      default: null,
    },
    source: {
      type: String,
      enum: ["main_app", "chrome_extension"],
      default: "main_app",
    },
    ephemeral: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

chatSessionSchema.index({ _id: 1 }, { unique: true });

export default mongoose.model("ChatSession", chatSessionSchema);
