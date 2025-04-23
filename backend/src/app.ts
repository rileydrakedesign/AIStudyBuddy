import express from 'express';
import { config } from 'dotenv';
import morgan from 'morgan';
import appRouter from './routes/index.js';
import cookieParser from 'cookie-parser';
import cors from "cors";

// Load environment variables from .env file
config();

// Initialize Express application
const app = express();

// Define allowed origins
const allowedOrigins = [
  "https://localhost:5173",                     // Frontend Application
  "chrome-extension://fgammdbnfifiohdnmdlcgofflpgbhklk"      // Replace with your actual Chrome Extension ID
];

// CORS configuration options
const corsOptions: cors.CorsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      // Origin is allowed
      return callback(null, true);
    } else {
      // Origin is not allowed
      return callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true, // Allow cookies to be sent
};

// Apply CORS middleware with the defined options
app.use(cors(corsOptions));

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to parse cookies with a secret for signed cookies
app.use(cookieParser(process.env.COOKIE_SECRET));

// Logging middleware (remove in production)
app.use(morgan('dev'));

// Route handling
app.use("/api/v1", appRouter);

// Error handling middleware for CORS errors
app.use((err, req, res, next) => {
  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    res.status(403).json({ message: 'CORS Error: This origin is not allowed.' });
  } else {
    next(err);
  }
});

// Generic error handling middleware (optional but recommended)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

export default app;