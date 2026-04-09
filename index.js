import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const app = express();
const server = createServer(app);
const io = new Server(server);

const __dirname = dirname(fileURLToPath(import.meta.url));

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// 🔹 Store users
let users = {};

io.on('connection', (socket) => {

  // 🔹 User joins
  socket.on('join', (username) => {
    users[socket.id] = username;

    io.emit('online users', Object.values(users));
  });

  // 🔹 Join room
  socket.on('join room', (room) => {
    socket.join(room);
  });

  // 🔹 Send message
  socket.on('chat message', (data) => {
    const { text, room } = data;

    io.to(room).emit('chat message', {
      text,
      user: users[socket.id]
    });
  });

  // 🔹 Disconnect
  socket.on('disconnect', () => {
    delete users[socket.id];
    io.emit('online users', Object.values(users));
  });

});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`server running at http://localhost:${port}`);
});