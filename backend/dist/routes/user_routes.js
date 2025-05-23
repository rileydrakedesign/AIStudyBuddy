import { Router } from 'express';
import { getAllUsers, userLogin, userSignup, verifyUser, userLogout, getUserClasses, deleteUserClass } from '../controllers/user_controllers.js';
import { loginValidator, signupValidator, validate } from "../utils/validators.js";
import { verifyToken } from "../utils/token_manager.js";
const userRoutes = Router();
userRoutes.get("/", getAllUsers);
userRoutes.post("/signup", validate(signupValidator), userSignup);
userRoutes.post("/login", validate(loginValidator), userLogin);
userRoutes.get("/auth-status", verifyToken, verifyUser);
userRoutes.get("/logout", verifyToken, userLogout);
userRoutes.get("/classes", verifyToken, getUserClasses);
userRoutes.delete("/classes/:classId", verifyToken, deleteUserClass);
export default userRoutes;
//# sourceMappingURL=user_routes.js.map