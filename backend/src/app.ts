import express from 'express';
import { config } from 'dotenv';
import morgan from 'morgan'
import appRouter from './routes/index.js';
import cookieParser from 'cookie-parser';
import cors from "cors";

config();
//const var holds functionality of exprerss application
const app = express();


//middlewares
// Dynamic CORS Configuration
const allowedOrigins = [
    "http://localhost:5173", // Local frontend app
    "chrome-extension://fgammdbnfifiohdnmdlcgofflpgbhklk", // Production Chrome extension
  ];
  
  // CORS middleware with conditional logic for null origin
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with 'null' origin for unpacked Chrome extensions (development)
        if (!origin || allowedOrigins.includes(origin) || origin === "null") {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true, // Allow cookies to be sent
      methods: ["GET", "POST", "OPTIONS"], // Allowed HTTP methods
    })
  );

app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

//remove in production
app.use(morgan('dev'));

app.use("/api/v1", appRouter);

export default app;

