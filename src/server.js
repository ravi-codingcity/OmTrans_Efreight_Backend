const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/database');

// Load env vars
dotenv.config();

// Initialize express app
const app = express();

// CORS - Allow all origins
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Body parser
app.use(express.json());

// Start server after DB connection
const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();

    // Routes - only register after DB is connected
    app.use('/api/auth', require('./routes/authRoutes'));
    app.use('/api/quotations', require('./routes/quotationRoutes'));

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({ success: true, message: 'Server running' });
    });

    // Start server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server on port ${PORT}`));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
