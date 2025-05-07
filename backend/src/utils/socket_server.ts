// utils/socket_server.ts
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import signature from "cookie-signature";
import Document from "../models/documents.js";
import { COOKIE_NAME } from "./constants.js";
import dotenv from "dotenv";
import logger from "./logger.js";   

dotenv.config();

/*-------------------------------------------------------------------
  DEBUG helper – wrap every interesting datum with a clear label
-------------------------------------------------------------------*/
const log = (...args: any[]) => logger.debug(args);

/*-------------------------------------------------------------------
  In‑memory socket registry
-------------------------------------------------------------------*/
const userSockets: Map<string, Socket[]> = new Map();
export let io: Server;

/*-------------------------------------------------------------------
  initialiseWebSocket  – call before app.listen()
-------------------------------------------------------------------*/
export const initializeWebSocket = (server: any /* http.Server */) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "https://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  /*---------------- JWT auth middleware with deep logging ----------------*/
  io.use((socket, next) => {
    log("— new handshake —");
    log("raw cookie header:", socket.request.headers.cookie || "‹none›");

    const raw =
      socket.handshake.auth?.token ||
      parseCookies(socket.request.headers.cookie || "")[COOKIE_NAME];

    log("token from client:", raw || "‹undefined›");

    if (!raw) return next(new Error("Authentication error"));

    let token = raw;

    /* Unsigned cookie handling */
    if (token.startsWith("s:")) {
      log("cookie looks signed → unsigning…");
      const unsigned = signature.unsign(
        token.slice(2),
        process.env.COOKIE_SECRET || process.env.JWT_SECRET
      );
      if (typeof unsigned !== "string") {
        log("unsign failed – bad signature");
        return next(new Error("Authentication error"));
      }
      token = unsigned;
      log("unsigned token:", token);
    }

    /* Verify JWT */
    jwt.verify(token, process.env.JWT_SECRET as string, (err, decoded: any) => {
      if (err) {
        log("jwt.verify error:", err.message);
        return next(new Error("Authentication error"));
      }
      log("jwt decoded payload:", decoded);
      socket.data.userId = decoded.id;
      next();
    });
  });

  /*---------------- extra engine‑level connection_error hook --------------*/
  io.engine.on("connection_error", (err: any) => {
    log("ENGINE connection_error →", {
      reqHeaders: err.req?.headers,
      code: err.code,
      message: err.message,
    });
  });

  /*---------------- client connection ----------------*/
  io.on("connection", (socket: Socket) => {
    const uid = socket.data.userId as string;
    if (!uid) return socket.disconnect(true);

    socket.join(uid);
    addUserSocket(uid, socket);
    log(`✅ WS connected for user ${uid} (socket ${socket.id})`);

    socket.on("disconnect", (reason) =>
      log(`⚠️  socket ${socket.id} disconnected →`, reason)
    );
  });

  /*------------- Mongo change‑stream listener (unchanged) -----------------*/
  Document.watch(
    [{ $match: { "updateDescription.updatedFields.isProcessing": false } }],
    { fullDocument: "updateLookup" }
  ).on("change", (change) => {
    const d: any = change.fullDocument;
    const room = d.userId?.toString();
    if (!room) return;

    io.to(room).emit("document-ready", {
      docId: d._id.toString(),
      fileName: d.fileName,
      className: d.className,
    });
    log("📨 emitted document‑ready to", room);
  });

  logger.info("✅ WebSocket server ready – detailed auth logging enabled");
};

/*-------------------------------------------------------------------
  helper / utility functions
-------------------------------------------------------------------*/
const addUserSocket = (userId: string, socket: Socket) => {
  const list = userSockets.get(userId) || [];
  list.push(socket);
  userSockets.set(userId, list);
};
const removeUserSocket = (userId: string, socketId: string) => {
  const list = userSockets.get(userId);
  if (!list) return;
  const idx = list.findIndex((s) => s.id === socketId);
  if (idx !== -1) list.splice(idx, 1);
  if (list.length === 0) userSockets.delete(userId);
};
function parseCookies(header: string) {
  const out: Record<string, string> = {};
  header.split(";").forEach((pair) => {
    const [k, ...v] = pair.split("=");
    if (k && v) out[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  return out;
}
