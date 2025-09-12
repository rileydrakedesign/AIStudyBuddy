
import { Router } from 'express';
import { getAllUsers, userLogin, userSignup, verifyUser, userLogout, getUserClasses, deleteUserClass, googleAuth } from '../controllers/user_controllers.js';
import { loginValidator, signupValidator, validate, forgotPasswordValidator, resetPasswordValidator } from "../utils/validators.js"
import { verifyToken } from "../utils/token_manager.js";
import { confirmEmail, resendConfirmEmail } from "../controllers/user_confirm.js";
import { forgotPassword, resetPassword } from "../controllers/password_reset.js";

const userRoutes = Router();

userRoutes.get("/", getAllUsers);
userRoutes.post("/signup", validate(signupValidator), userSignup)
userRoutes.post("/login", validate(loginValidator), userLogin)
userRoutes.post("/google", googleAuth)
userRoutes.get("/auth-status", verifyToken, verifyUser);
userRoutes.get("/logout", verifyToken, userLogout);
userRoutes.get("/classes", verifyToken, getUserClasses);
userRoutes.delete("/classes/:classId", verifyToken, deleteUserClass);
userRoutes.get("/confirm/:token", confirmEmail);
userRoutes.post("/resend-confirmation", resendConfirmEmail);

// password reset (public)
userRoutes.post("/forgot-password", validate(forgotPasswordValidator), forgotPassword);
userRoutes.post("/reset-password", validate(resetPasswordValidator), resetPassword);

export default userRoutes;
