const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7,
});

app.use(express.static(__dirname + "/public"));

let drawingHistory = [];
let connectedUsers = {};

function escapeHtml(text) {
  if (!text) return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

io.on("connection", (socket) => {
  socket.emit("init_history", drawingHistory);
  socket.emit("update_users", Object.values(connectedUsers));

  socket.on("join_user", (data) => {
    const cleanName = escapeHtml(data.username).substring(0, 15) || "Anon";
    const color = data.color || "#000000";

    socket.userData = {
      id: socket.id,
      username: cleanName,
      color: color,
      x: 0,
      y: 0,
      lastChatTime: 0,
    };
    connectedUsers[socket.id] = socket.userData;
    io.emit("update_users", Object.values(connectedUsers));
  });

  socket.on("update_profile", (data) => {
    if (socket.userData) {
      if (data.username)
        socket.userData.username = escapeHtml(data.username).substring(0, 15);
      if (data.color) socket.userData.color = data.color;
      io.emit("update_users", Object.values(connectedUsers));
    }
  });

  const addToHistory = (data) => {
    drawingHistory.push(data);
    if (drawingHistory.length > 50000) drawingHistory.shift();
  };

  socket.on("draw_line", (data) => {
    addToHistory(data);
    socket.broadcast.emit("draw_line", data);
  });
  socket.on("draw_shape", (data) => {
    addToHistory(data);
    socket.broadcast.emit("draw_shape", data);
  });
  socket.on("draw_image", (data) => {
    addToHistory(data);
    socket.broadcast.emit("draw_image", data);
  });

  socket.on("cursor_move", (pos) => {
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].x = pos.x;
      connectedUsers[socket.id].y = pos.y;
      socket.broadcast.volatile.emit("cursor_update", {
        id: socket.id,
        x: pos.x,
        y: pos.y,
        color: connectedUsers[socket.id].color,
        username: connectedUsers[socket.id].username,
      });
    }
  });

  socket.on("chat_message", (msg) => {
    if (!socket.userData) return;
    const now = Date.now();
    if (now - socket.userData.lastChatTime < 500) return; // Anti-spam
    socket.userData.lastChatTime = now;

    const cleanMsg = escapeHtml(msg).substring(0, 200);
    if (cleanMsg.length > 0) {
      io.emit("chat_message", {
        user: socket.userData.username,
        color: socket.userData.color,
        text: cleanMsg,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }
  });

  socket.on("disconnect", () => {
    if (socket.userData) {
      delete connectedUsers[socket.id];
      io.emit("update_users", Object.values(connectedUsers));
      io.emit("user_disconnected", socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
