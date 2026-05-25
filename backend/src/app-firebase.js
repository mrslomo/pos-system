// Firebase Functions variant - no HTTP server, no SerialPort, no socket.io server
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/users', require('./routes/users'));

// Scale weight endpoint (polling mode — no WebSocket on Functions)
app.get('/api/scale/weight', (req, res) => {
  res.json({ weight: 0, connected: false, message: 'Scale runs on device, not server' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), platform: 'firebase-functions' });
});

app.use(require('./middleware/errorHandler'));

module.exports = app;
