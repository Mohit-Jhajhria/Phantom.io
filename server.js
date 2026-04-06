const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// Serve the game HTML
app.use(express.static(path.join(__dirname, 'public')));

// Health endpoint (for keep-alive ping)
app.get('/ping', (req, res) => res.send('pong'));

// ── KEEP-ALIVE: ping ourselves every 14 minutes ──────────────────
// Prevents Render.com free tier from sleeping
const SELF_URL = process.env.RENDER_EXTERNAL_URL || null;
if (SELF_URL) {
  setInterval(() => {
    const https = require('https');
    https.get(`${SELF_URL}/ping`, (r) => {
      console.log(`[keep-alive] ping sent → ${r.statusCode}`);
    }).on('error', e => console.log('[keep-alive] ping failed:', e.message));
  }, 14 * 60 * 1000); // every 14 minutes
}

// ── MATCHMAKING ───────────────────────────────────────────────────
let waitingPlayer = null; // { socket, charIdx }
const rooms = {};         // roomId → { players: [socket0, socket1], state: {} }

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // ── Player wants to find a match ──────────────────────────────
  socket.on('findMatch', ({ charIdx }) => {
    console.log(`[match] ${socket.id} looking for match (char ${charIdx})`);

    if (waitingPlayer && waitingPlayer.socket.id !== socket.id) {
      // Pair with waiting player
      const p0 = waitingPlayer;
      const p1 = { socket, charIdx };
      waitingPlayer = null;

      const roomId = `room_${Date.now()}`;
      rooms[roomId] = { players: [p0.socket, p1.socket], alive: [true, true] };

      p0.socket.join(roomId);
      p1.socket.join(roomId);
      p0.socket.data.room = roomId;
      p1.socket.data.room = roomId;
      p0.socket.data.pid  = 0;
      p1.socket.data.pid  = 1;

      console.log(`[match] Room ${roomId}: ${p0.socket.id} vs ${p1.socket.id}`);

      // Tell each player who they are and opponent's character
      p0.socket.emit('matchFound', { pid: 0, opponentChar: p1.charIdx, roomId });
      p1.socket.emit('matchFound', { pid: 1, opponentChar: p0.charIdx, roomId });

    } else {
      // Wait for opponent
      waitingPlayer = { socket, charIdx };
      socket.emit('waiting');
      console.log(`[match] ${socket.id} waiting…`);
    }
  });

  // ── Cancel matchmaking ─────────────────────────────────────────
  socket.on('cancelMatch', () => {
    if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
      waitingPlayer = null;
      console.log(`[match] ${socket.id} cancelled`);
    }
  });

  // ── Relay player state to opponent ────────────────────────────
  // Sent every frame by each player — their own position/angle/health
  socket.on('playerState', (state) => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('opponentState', state);
  });

  // ── Relay bullet fired event ───────────────────────────────────
  socket.on('bulletFired', (data) => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('opponentBullet', data);
  });

  // ── Relay hit confirmation ─────────────────────────────────────
  socket.on('hitConfirm', (data) => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('opponentHit', data);
  });

  // ── Player died ───────────────────────────────────────────────
  socket.on('playerDied', () => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('opponentDied');
  });

  // ── Round over (winner declares) ──────────────────────────────
  socket.on('roundOver', (data) => {
    const room = socket.data.room;
    if (!room) return;
    io.to(room).emit('roundResult', data);
  });

  // ── Pulse sync (host triggers, tells opponent) ─────────────────
  socket.on('pulseSpawned', (data) => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('opponentPulse', data);
  });

  // ── Disconnect ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);
    // Remove from waiting queue
    if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
      waitingPlayer = null;
    }
    // Notify opponent
    const room = socket.data.room;
    if (room) {
      socket.to(room).emit('opponentLeft');
      delete rooms[room];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Phantom Regiment server on port ${PORT}`));
