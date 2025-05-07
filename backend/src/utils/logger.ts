import * as Pino from "pino";

// Reach the callable factory regardless of typings
const pino = (Pino as any).default ?? (Pino as any);
/**
 * One logger instance for the entire Node service.
 * — Pretty‑prints in dev, pure JSON in production (Heroku, Render, etc.).
 * — Log level is driven by LOG_LEVEL, defaults to “info”.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "yyyy‑mm‑dd HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

export default logger;
