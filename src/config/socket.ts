import { Server } from "socket.io";

let io: Server;

export const setSocketServer = (socketServer: Server) => {
  io = socketServer;
};

export const getSocketServer = () => {
  if (!io) {
    throw new Error("Socket.IO server has not been initialized");
  }
  return io;
};
