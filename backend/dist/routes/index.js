import { Router } from 'express';
import userRoutes from './user_routes.js';
import chatRoutes from './chat_routes.js';
import documentRoutes from './document_routes.js';
import downloadRoutes from './download_routes.js';
import profileRoutes from './profile_routes.js';
const appRouter = Router();
appRouter.use("/user", userRoutes);
appRouter.use("/chat", chatRoutes);
appRouter.use("/documents", documentRoutes);
appRouter.use('/download', downloadRoutes);
appRouter.use("/profile", profileRoutes);
export default appRouter;
//# sourceMappingURL=index.js.map