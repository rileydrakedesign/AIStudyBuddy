import { io, Socket } from "socket.io-client";

let socket: Socket;

export const initializeSocket = (): Socket => {
  if (!socket) {
    socket = io("https://localhost:3000", {
      withCredentials: true, // ensures cookies are sent along
    });
  }
  return socket;
};

export { socket };
