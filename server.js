const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/ping', (req, res) => res.send('pong'));

// ── KEEP-ALIVE ──────────────────────────────────────────────────
const SELF_URL = process.env.RENDER_EXTERNAL_URL || null;
if (SELF_URL) {
  setInterval(() => {
    require('https').get(`${SELF_URL}/ping`, r => {
      console.log(`[keep-alive] ${r.statusCode}`);
    }).on('error', e => console.log('[keep-alive] fail:', e.message));
  }, 14 * 60 * 1000);
}

// ── MATCHMAKING ─────────────────────────────────────────────────
let waitingPlayer = null;
const rooms = {};

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // PING measurement — client sends, we reply immediately
  socket.on('ping_check', () => socket.emit('pong_check'));

  socket.on('findMatch', ({ charIdx }) => {
    if (waitingPlayer && waitingPlayer.socket.id !== socket.id) {
      const p0 = waitingPlayer, p1 = { socket, charIdx };
      waitingPlayer = null;
      const roomId = `r${Date.now()}`;
      rooms[roomId] = { sockets: [p0.socket, p1.socket] };
      p0.socket.join(roomId); p1.socket.join(roomId);
      p0.socket.data.room = roomId; p1.socket.data.room = roomId;
      p0.socket.data.pid  = 0;      p1.socket.data.pid  = 1;
      console.log(`[match] ${roomId}: ${p0.socket.id} vs ${p1.socket.id}`);
      p0.socket.emit('matchFound', { pid:0, opponentChar:p1.charIdx, roomId });
      p1.socket.emit('matchFound', { pid:1, opponentChar:p0.charIdx, roomId });
    } else {
      waitingPlayer = { socket, charIdx };
      socket.emit('waiting');
    }
  });

  socket.on('cancelMatch', () => {
    if (waitingPlayer?.socket.id === socket.id) waitingPlayer = null;
  });

  // Relay player state (position/angle/health) to opponent
  socket.on('playerState', (state) => {
    const room = socket.data.room;
    if (room) socket.to(room).emit('opponentState', state);
  });

  // Relay bullet fired
  socket.on('bulletFired', (data) => {
    const room = socket.data.room;
    if (room) socket.to(room).emit('opponentBullet', data);
  });

  // Shooter confirms hit damage — relay to victim
  socket.on('hitConfirm', (data) => {
    const room = socket.data.room;
    if (room) socket.to(room).emit('youWereHit', data);
  });

  // Victim died — tell opponent
  socket.on('iDied', () => {
    const room = socket.data.room;
    if (room) socket.to(room).emit('opponentDied');
  });

  // Host sends pulse, relay to client
  socket.on('pulseSpawned', (data) => {
    const room = socket.data.room;
    if (room) socket.to(room).emit('opponentPulse', data);
  });

  // Round result broadcast
  socket.on('roundOver', (data) => {
    const room = socket.data.room;
    if (room) io.to(room).emit('roundResult', data);
  });

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    if (waitingPlayer?.socket.id === socket.id) waitingPlayer = null;
    const room = socket.data.room;
    if (room) { socket.to(room).emit('opponentLeft'); delete rooms[room]; }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Phantom Regiment on :${PORT}`));
