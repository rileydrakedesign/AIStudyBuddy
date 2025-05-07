import express from 'express';
import { config } from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';

/* ─────────── NEW: structured logging ─────────── */
import * as PinoHttpNS from 'pino-http';                     // namespace import
// `pino-http` is callable at `.default` when loaded in an ES-module build;
// fall back to the namespace itself for CommonJS resolution.
const pinoHttp = (PinoHttpNS as any).default ?? (PinoHttpNS as any);

import logger from './utils/logger.js';           // the singleton created in utils/logger.ts
/* ──────────────────────────────────────────────── */

import appRouter from './routes/index.js';

// Load environment variables from .env file
config();

// Initialize Express application
const app = express();

// Define allowed origins
const allowedOrigins = [
  'https://localhost:5173',                       // Frontend Application
  'chrome-extension://fgammdbnfifiohdnmdlcgofflpgbhklk', // Chrome Extension
];

// CORS configuration options
const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);                 // non-browser client
    return allowedOrigins.includes(origin)
      ? callback(null, true)
      : callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true, // Allow cookies to be sent
};

// Apply middlewares
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

/* ─────────── NEW: replace morgan with pino-http ─────────── */
app.use(
  pinoHttp({
    logger,                               // reuse global pino instance
    serializers: {
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);
/* ─────────────────────────────────────────────────────────── */

// Route handling
app.use('/api/v1', appRouter);

// Error handling middleware for CORS errors
app.use((err, req, res, next) => {
  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    req.log?.warn({ origin: req.headers.origin }, 'CORS blocked request');
    return res
      .status(403)
      .json({ message: 'CORS Error: This origin is not allowed.' });
  }
  next(err);
});

// Generic error handling middleware
app.use((err, req, res, _next) => {
  (req.log ?? logger).error({ err }, 'Unhandled error');
  res.status(500).json({ message: 'Internal Server Error' });
});

export default app;
