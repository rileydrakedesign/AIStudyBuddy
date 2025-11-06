/**
 * Centralized logging configuration for Class Chat AI Node.js service.
 *
 * Provides structured logging with JSON format in production and
 * pretty-printed format in development. Supports context injection
 * for user_id and session_id.
 */
import * as Pino from "pino";
// Reach the callable factory regardless of typings
const pino = Pino.default ?? Pino;
const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || "info";
/**
 * Base logger instance for the entire Node service.
 * - Pretty-prints in dev, pure JSON in production (Heroku, Render, etc.).
 * - Log level is driven by LOG_LEVEL environment variable, defaults to "info".
 * - Includes user_id and session_id fields when available
 */
const logger = pino({
    level: logLevel,
    // Base fields included in every log entry
    base: {
        service: "class-chat-node",
        environment: process.env.NODE_ENV || "development",
    },
    // Timestamp formatting
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    // Pretty-print in development, JSON in production
    transport: !isProduction
        ? {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "yyyy-mm-dd HH:MM:ss.SSS",
                ignore: "pid,hostname",
                messageFormat: "{user_id} | {session_id} | {msg}",
            },
        }
        : undefined,
    // Serializers for consistent formatting
    serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
    },
});
/**
 * Create a child logger with user and session context.
 *
 * @param userId - User identifier for log context
 * @param sessionId - Session identifier for log context
 * @returns Logger instance with bound context
 *
 * @example
 * const log = createLoggerWithContext("user123", "sess456");
 * log.info("Processing request");
 */
export function createLoggerWithContext(userId = "unknown", sessionId = "unknown") {
    return logger.child({
        user_id: userId || "unknown",
        session_id: sessionId || "unknown",
    });
}
/**
 * Express middleware to inject user_id into request logger.
 *
 * Attaches a logger instance to req.log with user context from JWT.
 *
 * @example
 * app.use(loggerMiddleware);
 * req.log.info("Authenticated request");
 */
export function loggerMiddleware(req, res, next) {
    const userId = req.user?.id || req.user?._id?.toString() || "anonymous";
    const sessionId = req.sessionID || req.headers["x-session-id"] || "none";
    // Attach contextual logger to request object
    req.log = createLoggerWithContext(userId, sessionId);
    // Log incoming request
    req.log.info({
        method: req.method,
        path: req.path,
        ip: req.ip,
    }, "Incoming request");
    next();
}
export default logger;
//# sourceMappingURL=logger.js.map