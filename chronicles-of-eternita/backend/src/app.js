import express from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/authRoutes.js';
import characterRoutes from './routes/characterRoutes.js';
import mapRoutes from './routes/mapRoutes.js';
import assetRoutes from './routes/assetRoutes.js';
import rollRoutes from './routes/rollRoutes.js';
import { connectDatabase } from './utils/database.js';
import { initSockets } from './sockets/index.js';
import { setSocketServer } from './sockets/io.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SQLiteStore = connectSqlite3(session);

const createApp = () => {
  const app = express();

  app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
  }));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  const sessionMiddleware = session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: path.join(__dirname, '..')
    }),
    secret: process.env.SESSION_SECRET || 'super_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
  });

  app.use(sessionMiddleware);

  const uploadDir = process.env.UPLOAD_DIR || 'uploads';
  app.use('/uploads', express.static(path.join(__dirname, `../${uploadDir}`)));

  app.use('/api/auth', authRoutes);
  app.use('/api/characters', characterRoutes);
  app.use('/api/maps', mapRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/roll', rollRoutes);

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: 'http://localhost:5173',
      credentials: true
    }
  });

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  io.use((socket, next) => {
    socket.handshake.session = socket.request.session;
    next();
  });

  initSockets(io);
  setSocketServer(io);

  const start = async (port = process.env.PORT || 4000) => {
    await connectDatabase();
    return new Promise((resolve) => {
      httpServer.listen(port, () => {
        resolve({ port });
      });
    });
  };

  return { app, io, httpServer, start };
};

export default createApp;
