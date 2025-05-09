import { Router } from "express";
import { verifyToken } from "../utils/token_manager.js";
import {
  chatCompletionValidator,
  validate,
  chatSessionValidator,
} from "../utils/validators.js";

import {
  createNewChatSession,
  getUserChatSessions,
  generateChatCompletion,
  deleteChatSession,
  deleteAllChatSessions,
} from "../controllers/chat_controllers.js";

// Mongoose utilities
import { isValidObjectId } from "mongoose";

// If you're using a lazy-loaded chunk model for the "study_buddy_demo" DB:
import getChunkModel from "../models/chunkModel.js";
// Otherwise, if you're importing a direct model, e.g. `import Chunk from "../models/chunkModel.js";`,
// be sure that model does NOT get invoked like a function (Chunk(...)).

const chatRoutes = Router();

/* ---------------------------
   EXISTING CHAT ROUTES
   --------------------------- */

// Generate chat completion (send a message in a chat session)
chatRoutes.post(
  "/new",
  verifyToken,
  validate(chatCompletionValidator),
  generateChatCompletion
);

// Create a new chat session
chatRoutes.post(
  "/new-session",
  verifyToken,
  validate(chatSessionValidator),
  createNewChatSession
);

// Get all chat sessions for the user
chatRoutes.get("/sessions", verifyToken, getUserChatSessions);

// Delete a specific chat session
chatRoutes.delete("/session/:chatSessionId", verifyToken, deleteChatSession);

// Delete all chat sessions for the user
chatRoutes.delete("/sessions", verifyToken, deleteAllChatSessions);

/* ---------------------------
   GET CHUNK BY ID
   --------------------------- */

/**
 * Returns chunk text and metadata from 'study_materials2' in the 'study_buddy_demo' DB.
 * This lets the frontend retrieve chunk text on-demand by chunkId from each message.
 */
chatRoutes.get("/chunk/:chunkId", verifyToken, async (req, res) => {
  try {
    const { chunkId } = req.params;

    // Ensure chunkId is valid as an ObjectId
    if (!isValidObjectId(chunkId)) {
      return res.status(400).json({ message: "Invalid chunk ID format" });
    }

    // Get the Mongoose model (lazy-loaded for 'study_buddy_demo' DB)
    const Chunk = await getChunkModel();

    // Query the database: findById(chunkId) returns null if not found
    const doc = await Chunk.findById(chunkId).lean();
    if (!doc) {
      return res.status(404).json({ message: "Chunk not found" });
    }

    // Return only the fields you want the client to see
    return res.status(200).json({
      text: doc.text,
      pageNumber: doc.page_number ?? null,
      fileName: doc.file_name ?? null,
      docId: doc.doc_id ?? null,
      classId: doc.class_id ?? null,
      // any other fields you wish to expose (title, author, etc.)
    });
  } catch (error) {
    (req as any).log.error(error, "Error fetching chunk");
    return res.status(500).json({ message: "Unable to fetch chunk" });
  }  
});

export default chatRoutes;
