require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

let waiting = [];
const partners = new Map();

function pairUsers(a, b) {
  if (!a || !b) return;
  partners.set(a.id, b.id);
  partners.set(b.id, a.id);

  const roomId = `room_${a.id}_${b.id}`;
  a.join(roomId);
  b.join(roomId);

  const initiator = Math.random() < 0.5 ? a.id : b.id;
  io.to(a.id).emit('partner_found', { roomId, initiator: initiator === a.id });
  io.to(b.id).emit('partner_found', { roomId, initiator: initiator === b.id });
}

function leavePartner(socket, reason='left') {
  const partnerId = partners.get(socket.id);
  if (partnerId) {
    partners.delete(socket.id);
    partners.delete(partnerId);
    io.to(partnerId).emit('partner_left', { reason });
  }
}

io.on('connection', (socket) => {
  leavePartner(socket, 'reconnected');

  socket.on('find_partner', () => {
    waiting = waiting.filter(id => id !== socket.id && io.sockets.sockets.get(id));
    if (waiting.length > 0) {
      const partnerId = waiting.shift();
      const partner = io.sockets.sockets.get(partnerId);
      if (partner && partner.connected && socket.connected) {
        pairUsers(socket, partner);
      } else {
        socket.emit('queueing');
        waiting.push(socket.id);
      }
    } else {
      socket.emit('queueing');
      waiting.push(socket.id);
    }
  });

  socket.on('signal', (payload) => {
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('signal', payload);
    }
  });

  socket.on('text_message', (msg) => {
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('text_message', { from: 'stranger', text: String(msg || '').slice(0, 2000) });
    }
  });

  socket.on('next', () => {
    leavePartner(socket, 'nexted');
    setTimeout(() => {
      socket.emit('queueing');
      waiting.push(socket.id);
      while (waiting.length >= 2) {
        const firstId = waiting.shift();
        const secondId = waiting.shift();
        const s1 = io.sockets.sockets.get(firstId);
        const s2 = io.sockets.sockets.get(secondId);
        if (s1 && s1.connected && s2 && s2.connected) {
          pairUsers(s1, s2);
          break;
        } else {
          if (s1 && s1.connected) waiting.push(s1.id);
          if (s2 && s2.connected) waiting.push(s2.id);
        }
      }
    }, 100);
  });

  socket.on('disconnect', () => {
    waiting = waiting.filter(id => id !== socket.id);
    leavePartner(socket, 'disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
