import { io, Socket } from "socket.io-client";

let socket: Socket;

export const initializeSocket = (): Socket => {
  /* ✱ NEW: if a singleton exists but was previously disconnected,
            call .connect() to reopen it instead of creating nothing. */
  if (socket) {
    if (socket.disconnected) socket.connect();
    return socket;
  }

  console.log(
    "%c[WS] Initialising…",
    "color:dodgerblue;font-weight:bold;",
    { tokenPresent: false }
  );

  socket = io("https://localhost:3000", {
    withCredentials: true,          // keep cookie auth
    /* leave transports undefined so Socket.IO can upgrade */
  });

  /* ---------- Diagnostic hooks ---------- */
  socket.on("connect", () =>
    console.log("%c[WS] ✅ Connected", "color:green;font-weight:bold;", {
      id: socket.id,
    })
  );
  socket.on("connect_error", (err) =>
    console.error("%c[WS] ❌ connect_error", "color:red;font-weight:bold;", err)
  );
  socket.on("error", (err) =>
    console.error("%c[WS] ⛔ error", "color:crimson;font-weight:bold;", err)
  );
  socket.on("disconnect", (reason) =>
    console.warn("%c[WS] ⚠️  Disconnected", "color:orange;font-weight:bold;", reason)
  );

  return socket;
};
