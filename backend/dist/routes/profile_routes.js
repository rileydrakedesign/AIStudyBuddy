import { Router } from 'express';
import { getUserProfile, updateUserProfile, resetUserPassword, changeUserPlan } from '../controllers/profile_controllers.js';
import { verifyToken } from "../utils/token_manager.js";
const profileRoutes = Router();
// Get the current user's profile data
profileRoutes.get("/", verifyToken, getUserProfile);
// Update the user's profile data (first name, last name, email)
profileRoutes.put("/", verifyToken, updateUserProfile);
// Reset the user's password
profileRoutes.post("/reset-password", verifyToken, resetUserPassword);
// Change the user's plan (Free Tier/Premium)
profileRoutes.post("/change-plan", verifyToken, changeUserPlan);
export default profileRoutes;
//# sourceMappingURL=profile_routes.js.map