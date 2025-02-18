import { Router } from 'express';
import { verifyToken } from "../utils/token_manager.js";
import { chatCompletionValidator, validate, chatSessionValidator } from "../utils/validators.js";
import { createNewChatSession, getUserChatSessions, generateChatCompletion, deleteChatSession, deleteAllChatSessions, } from "../controllers/chat_controllers.js";
// Protected API
const chatRoutes = Router();
// Generate chat completion (send a message in a chat session)
chatRoutes.post("/new", verifyToken, validate(chatCompletionValidator), 
//handleChatCompletionValidation,
generateChatCompletion);
// Create a new chat session
chatRoutes.post("/new-session", verifyToken, validate(chatSessionValidator), createNewChatSession);
// Get all chat sessions for the user
chatRoutes.get("/sessions", verifyToken, getUserChatSessions);
// Delete a specific chat session
chatRoutes.delete("/session/:chatSessionId", verifyToken, 
//validate(chatSessionIdValidator),
deleteChatSession);
// Delete all chat sessions for the user
chatRoutes.delete("/sessions", verifyToken, deleteAllChatSessions);
export default chatRoutes;
//# sourceMappingURL=chat_routes.js.map