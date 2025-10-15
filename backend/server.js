import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { Server as SocketServer } from 'socket.io';

import authRoutes from './src/routes/authRoutes.js';
import characterRoutes from './src/routes/characterRoutes.js';
import mapRoutes from './src/routes/mapRoutes.js';
import rollRoutes from './src/routes/rollRoutes.js';
import { connectDatabase } from './src/utils/db.js';
import { registerMapSocket } from './src/sockets/mapSocket.js';
import { registerDiceSocket } from './src/sockets/diceSocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: '*',
  },
});

// Register Socket.IO namespaces
registerMapSocket(io);
registerDiceSocket(io);

// Global middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const uploadsDir = process.env.UPLOAD_DIR || 'uploads';
app.use('/uploads', express.static(path.resolve(__dirname, uploadsDir)));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/maps', mapRoutes);
app.use('/api/roll', rollRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Chronicles of Eternita API' });
});

const PORT = process.env.PORT || 4000;

// Start server after establishing database connection
connectDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
