// File: utils/websocket.ts
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "./constants.js";
// This map maintains an array of sockets for each connected user.
const userSockets = new Map();
export let io;
/**
 * Initializes the Socket.IO server with JWT authentication middleware.
 * @param server - The underlying HTTP server (or HTTPS server) to attach to.
 */
export const initializeWebSocket = (server) => {
    io = new Server(server, {
        cors: {
            // Update these settings to match your deployment requirements.
            origin: "https://localhost:5173",
            methods: ["GET", "POST"],
            credentials: true,
        },
    });
    // Middleware: Authenticate incoming connections using JWT from cookies.
    io.use((socket, next) => {
        const cookies = socket.request.headers.cookie;
        if (!cookies) {
            return next(new Error("Authentication error: No cookies found"));
        }
        const parsedCookies = parseCookies(cookies);
        const token = parsedCookies[COOKIE_NAME];
        if (!token) {
            return next(new Error("Authentication error: No token found"));
        }
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                return next(new Error("Authentication error: Invalid token"));
            }
            // Save the decoded token information (user ID) on the socket instance.
            socket.data.userId = decoded.id;
            next();
        });
    });
    io.on("connection", (socket) => {
        const userId = socket.data.userId;
        if (userId) {
            // Add the socket to the user's list of active sockets.
            if (userSockets.has(userId)) {
                userSockets.get(userId).push(socket);
            }
            else {
                userSockets.set(userId, [socket]);
            }
            console.log(`User ${userId} connected (socket ID: ${socket.id})`);
            // Remove the socket from the map upon disconnection.
            socket.on("disconnect", () => {
                console.log(`Socket ${socket.id} disconnected`);
                const sockets = userSockets.get(userId);
                if (sockets) {
                    const index = sockets.findIndex((s) => s.id === socket.id);
                    if (index !== -1) {
                        sockets.splice(index, 1);
                    }
                    if (sockets.length === 0) {
                        userSockets.delete(userId);
                    }
                }
            });
        }
        else {
            console.error("Connection established without a user ID.");
            socket.disconnect(true);
        }
    });
};
/**
 * Helper function to send a message to all active sockets for a given user.
 * @param userId - The user ID for which to forward the message.
 * @param message - The message object (JSON) to send.
 */
export const sendToUserSocket = (userId, message) => {
    const sockets = userSockets.get(userId);
    if (sockets && sockets.length > 0) {
        sockets.forEach((socket) => {
            socket.emit("chat", message);
        });
    }
    else {
        console.log(`No active socket found for user ${userId}`);
    }
};
/**
 * Parses a cookie header string into an object.
 * @param cookieHeader - The raw cookie header string.
 * @returns An object mapping cookie names to their decoded values.
 */
function parseCookies(cookieHeader) {
    const cookies = {};
    cookieHeader.split(";").forEach((cookie) => {
        const [key, ...v] = cookie.split("=");
        if (key && v) {
            cookies[key.trim()] = decodeURIComponent(v.join("=").trim());
        }
    });
    return cookies;
}
//# sourceMappingURL=websocket.js.map