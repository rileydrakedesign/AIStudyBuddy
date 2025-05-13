import express from 'express';
import { config } from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';

/* ─────────── structured logging ─────────── */
import * as PinoHttpNS from 'pino-http';
const pinoHttp = (PinoHttpNS as any).default ?? (PinoHttpNS as any);

import { v4 as uuid } from 'uuid';
import logger from './utils/logger.js';
/* ─────────────────────────────────────────── */

import appRouter from './routes/index.js';

config();                                    // load .env
const app = express();

// -------- CORS allow-list ------------
const allowedExact = new Set<string>([
  'http://localhost:5173',
  'https://localhost:5173',
  'chrome-extension://fgammdbnfifiohdnmdlcgofflpgbhklk',
  'https://class-chat-frontend.vercel.app',   // production alias
]);

function isAllowed(origin?: string): boolean {
  if (!origin) return true;                                         // curl / Postman
  if (allowedExact.has(origin)) return true;

  if (
    origin.startsWith('https://class-chat-') &&
    origin.includes('.vercel.app')
  ) {
    return true;
  }

  return false;
}

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    const ok = isAllowed(origin);
    cb(ok ? null : new Error('Not allowed by CORS'), ok);
  },
  credentials: true,
  methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization',
};
/* -------------------------------------- */

/* middle-ware chain ------------------------------------------------------ */
app.set('trust proxy', 1);                   // cookies behind Heroku router
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

app.use(
  pinoHttp({
    logger,
    genReqId: () => uuid(),
    serializers: { res: (res) => ({ statusCode: res.statusCode }) },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  })
);

app.use((req, res, next) => {
  if (req.id) res.setHeader('X-Request-ID', req.id as string);
  next();
});

/* routes ----------------------------------------------------------------- */
app.use('/api/v1', appRouter);

/* error handlers --------------------------------------------------------- */
app.use((err, req, res, next) => {
  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    req.log?.warn({ origin: req.headers.origin }, 'CORS blocked request');
    return res.status(403).json({ message: 'CORS Error: This origin is not allowed.' });
  }
  next(err);
});

app.use((err, req, res, _next) => {
  (req.log ?? logger).error({ err }, 'Unhandled error');
  res.status(500).json({ message: 'Internal Server Error' });
});

export default app;
