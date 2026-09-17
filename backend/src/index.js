require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Basic health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'AICFO API is running' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
