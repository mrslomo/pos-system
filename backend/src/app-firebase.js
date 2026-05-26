// Firebase Functions variant - no HTTP server, no SerialPort, no socket.io server
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/users', require('./routes/users'));
app.use('/api/partners', require('./routes/partners'));
app.use('/api/purchase-bills', require('./routes/purchase-bills'));
app.use('/api/delivery-bills', require('./routes/delivery-bills'));
app.use('/api/bulk-stock', require('./routes/bulk-stock'));
app.use('/api/held-bills', require('./routes/held-bills'));
app.use('/api/stock-returns', require('./routes/stock-returns'));
app.use('/api/bank-accounts', require('./routes/bank-accounts'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/stock-counts', require('./routes/stock-counts'));
app.use('/api/deterioration', require('./routes/deterioration'));
app.use('/api/shifts', require('./routes/shifts'));

// Scale weight endpoint (polling mode — no WebSocket on Functions)
app.get('/api/scale/weight', (req, res) => {
  res.json({ weight: 0, connected: false, message: 'Scale runs on device, not server' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), platform: 'firebase-functions' });
});

app.use(require('./middleware/errorHandler'));

module.exports = app;
