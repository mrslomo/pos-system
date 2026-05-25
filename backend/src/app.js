require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/users', require('./routes/users'));

// Scale endpoints
const scaleService = require('./services/scaleService');

app.get('/api/scale/ports', async (req, res, next) => {
  try {
    const ports = await scaleService.constructor.listPorts
      ? await require('serialport').SerialPort.list()
      : [];
    res.json(ports);
  } catch (err) { next(err); }
});

app.post('/api/scale/connect', async (req, res, next) => {
  try {
    const { port, baud_rate } = req.body;
    await scaleService.connect(port || process.env.SCALE_PORT, baud_rate || parseInt(process.env.SCALE_BAUD_RATE) || 9600);
    res.json({ message: 'Scale connected', port });
  } catch (err) { next(err); }
});

app.get('/api/scale/weight', (req, res) => {
  res.json({ weight: scaleService.getWeight(), connected: scaleService.isConnected() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-branch', (branchId) => {
    socket.join(`branch-${branchId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Broadcast scale weight via WebSocket
scaleService.on('weight', (weight) => {
  io.emit('scale-weight', { weight, timestamp: Date.now() });
});

// Broadcast to branches on sales/stock changes (called from routes)
app.set('io', io);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`POS Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, io };
