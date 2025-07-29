import { Router } from 'express';
import { getAllUsers, userLogin, userSignup, verifyUser, userLogout, getUserClasses, deleteUserClass } from '../controllers/user_controllers.js';
import { loginValidator, signupValidator, validate } from "../utils/validators.js";
import { verifyToken } from "../utils/token_manager.js";
import { confirmEmail, resendConfirmEmail } from "../controllers/user_confirm.js";
const userRoutes = Router();
userRoutes.get("/", getAllUsers);
userRoutes.post("/signup", validate(signupValidator), userSignup);
userRoutes.post("/login", validate(loginValidator), userLogin);
userRoutes.get("/auth-status", verifyToken, verifyUser);
userRoutes.get("/logout", verifyToken, userLogout);
userRoutes.get("/classes", verifyToken, getUserClasses);
userRoutes.delete("/classes/:classId", verifyToken, deleteUserClass);
userRoutes.get("/confirm/:token", confirmEmail);
userRoutes.post("/resend-confirmation", resendConfirmEmail);
export default userRoutes;
//# sourceMappingURL=user_routes.js.map