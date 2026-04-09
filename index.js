import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
const server = createServer(app);
const io = new Server(server);

const __dirname = dirname(fileURLToPath(import.meta.url));

// ✅ DB
const db = await open({
  filename: "chat.db",
  driver: sqlite3.Database,
});

await db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_offset TEXT UNIQUE,
  content TEXT,
  sender TEXT
);
`);

// ✅ Serve UI
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

// 🟢 Online users
const users = new Map();

io.on("connection", (socket) => {
  socket.username = socket.handshake.auth.username || "Anonymous";

  users.set(socket.id, socket.username);
  io.emit("online users", Array.from(users.values()));

  // 💬 Message
  socket.on("chat message", async (msg, clientOffset) => {
    const result = await db.run(
      "INSERT INTO messages (content, client_offset, sender) VALUES (?, ?, ?)",
      msg,
      clientOffset,
      socket.username
    );

    io.emit("chat message", {
      text: msg,
      sender: socket.username,
      status: "✔ Delivered",
      id: result.lastID,
    });
  });

  // ✔ Seen
  socket.on("seen", (id) => {
    socket.broadcast.emit("message seen", id);
  });

  // ✍️ Typing
  socket.on("typing", () => {
    socket.broadcast.emit("typing", socket.username);
  });

  socket.on("stop typing", () => {
    socket.broadcast.emit("stop typing");
  });

  // 🔄 Recover messages
  db.each("SELECT * FROM messages", (err, row) => {
    socket.emit("chat message", {
      text: row.content,
      sender: row.sender,
      status: "",
      id: row.id,
    });
  });

  socket.on("disconnect", () => {
    users.delete(socket.id);
    io.emit("online users", Array.from(users.values()));
  });
});

// ✅ PORT
const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});