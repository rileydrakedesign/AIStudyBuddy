// Load environment variables FIRST, before any other imports
import { config } from 'dotenv';
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
config({ path: envFile });

import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import helmet from "helmet";
import app from "./app.js";
import { connectToDatabase } from "./db/connection.js";
import { initializeWebSocket } from "./utils/socket_server.js";
import logger from "./utils/logger.js";

/* ────────────────────────────────────  Security middleware  ── */
app.set("trust proxy", 1); // 1 = first hop is the Heroku router

// Force HTTPS on any stray plain-HTTP request (shouldn’t happen on Heroku)
app.use((req, res, next) => {
  if (req.secure || process.env.NODE_ENV !== "production") return next();
  return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
});

// Enable HSTS so browsers remember to use HTTPS
app.use(
  helmet.hsts({
    maxAge: 60 * 60 * 24 * 365, // 1 year
    preload: true,
  })
);

/* ────────────────────────────────────  TLS handling  ───────── */
const CERT_PATH = "/Users/rileydrake/Desktop/AIStudyBuddy/localhost.pem";
const KEY_PATH  = "/Users/rileydrake/Desktop/AIStudyBuddy/localhost-key.pem";

const isProd = process.env.NODE_ENV === "production";
const PORT   = process.env.PORT || 3000;

let server: http.Server | https.Server;

if (isProd) {
  // Heroku has already terminated TLS; use plain HTTP inside the dyno
  server = http.createServer(app);
  logger.info("Running in production — HTTP behind Heroku SSL terminator");
} else {
  // Local development — use self-signed cert so wss:// works without warnings
  if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
    logger.error(
      "SSL certificate or key file not found. Please ensure 'localhost.pem' and 'localhost-key.pem' exist at the specified paths."
    );
    process.exit(1);
  }
  const key  = fs.readFileSync(KEY_PATH);
  const cert = fs.readFileSync(CERT_PATH);
  server = https.createServer({ key, cert }, app);
}

/* ────────────────────────────────────  Start-up  ───────────── */
connectToDatabase()
  .then(() => {
    initializeWebSocket(server); // attaches Socket.io to the same server
    server.listen(PORT, () =>
      logger.info(
        `Server running on ${isProd ? "http" : "https"}://localhost:${PORT}`
      )
    );
  })
  .catch((err) => {
    logger.error("Failed to connect to the database:", err);
    process.exit(1);
  });
