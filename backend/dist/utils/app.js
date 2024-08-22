import express from 'express';
import { config } from 'dotenv';
import morgan from 'morgan';
import appRouter from './routes/index.js';
config();
//const var holds functionality of exprerss application
const app = express();
//middlewares
app.use(express.json());
//remove in production
app.use(morgan('dev'));
app.use("/api/v1", appRouter);
export default app;
//connection and listeners
app.listen(3000, () => console.log("server open"));
//# sourceMappingURL=app.js.map