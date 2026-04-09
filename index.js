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

// ✅ Database setup
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

// ✅ Serve frontend
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

// ✅ Socket logic
io.on("connection", async (socket) => {

  // 🔹 Send message
  socket.on("chat message", async (msg, clientOffset, callback) => {
    let result;

    try {
      result = await db.run(
        "INSERT INTO messages (content, client_offset, sender) VALUES (?, ?, ?)",
        msg,
        clientOffset,
        socket.id
      );
    } catch (e) {
      if (e.errno === 19) {
        return callback(); // duplicate
      }
      return;
    }

    io.emit("chat message", {
      text: msg,
      sender: socket.id,
      id: result.lastID
    });

    callback();
  });

  // 🔹 Recover old messages (FIXED FORMAT)
  if (!socket.recovered) {
    try {
      await db.each(
        "SELECT id, content, sender FROM messages WHERE id > ?",
        [socket.handshake.auth.serverOffset || 0],
        (_err, row) => {
          socket.emit("chat message", {
            text: row.content,
            sender: row.sender,
            id: row.id
          });
        }
      );
    } catch (e) {
      console.log("Recovery error:", e);
    }
  }
});

// ✅ PORT FIX
const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});