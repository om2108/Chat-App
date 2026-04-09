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
    content TEXT
  );
`);

// ✅ Serve frontend
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

// ✅ Socket logic
io.on("connection", async (socket) => {
  socket.on("chat message", async (msg, clientOffset, callback) => {
    let result;
    try {
      result = await db.run(
        "INSERT INTO messages (content, client_offset) VALUES (?, ?)",
        msg,
        clientOffset,
      );
    } catch (e) {
      if (e.errno === 19) {
        callback(); // duplicate message
      }
      return;
    }

    io.emit(
      "chat message",
      {
        text: msg,
        sender: socket.id,
      },
      result.lastID,
    );
    callback();
  });

  // Recover old messages
  if (!socket.recovered) {
    try {
      await db.each(
        "SELECT id, content FROM messages WHERE id > ?",
        [socket.handshake.auth.serverOffset || 0],
        (_err, row) => {
          socket.emit("chat message", row.content, row.id);
        },
      );
    } catch (e) {
      console.log("Recovery error:", e);
    }
  }
});

// ✅ IMPORTANT PORT FIX (for Render)
const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`server running at http://localhost:${port}`);
});
