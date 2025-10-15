import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
let dbInstance;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveDatabasePath = () => {
  const configuredPath = process.env.SQLITE_PATH;
  const backendRoot = path.resolve(__dirname, '../..');

  if (configuredPath) {
    if (path.isAbsolute(configuredPath)) {
      return configuredPath;
    }
    return path.resolve(backendRoot, configuredPath);
  }

  return path.resolve(backendRoot, 'data/eternita.sqlite');
};

const applyMigrations = async (db) => {
  await db.exec('PRAGMA foreign_keys = ON;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      isGameMaster INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      health INTEGER NOT NULL DEFAULT 0,
      mana INTEGER NOT NULL DEFAULT 0,
      imageUrl TEXT,
      ownerId INTEGER,
      campaignId TEXT NOT NULL DEFAULT 'default',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      imagePath TEXT NOT NULL,
      campaignId TEXT NOT NULL DEFAULT 'default',
      state TEXT DEFAULT '{}',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

export const connectDatabase = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  const databasePath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  dbInstance = await createDatabaseConnection(databasePath);

  await applyMigrations(dbInstance);

  console.log(`[SQLite] Base initialisée dans ${databasePath}`);
  return dbInstance;
};

const createDatabaseConnection = (filename) =>
  new Promise((resolve, reject) => {
    const rawDb = new sqlite3.Database(filename, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(wrapDatabase(rawDb));
    });
  });

const wrapDatabase = (rawDb) => {
  const normalizeParams = (params) => {
    if (params.length === 1 && Array.isArray(params[0])) {
      return params[0];
    }
    return params;
  };

  return {
    get(sql, ...params) {
      const normalized = normalizeParams(params);
      return new Promise((resolve, reject) => {
        rawDb.get(sql, normalized, (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        });
      });
    },
    all(sql, ...params) {
      const normalized = normalizeParams(params);
      return new Promise((resolve, reject) => {
        rawDb.all(sql, normalized, (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows);
        });
      });
    },
    run(sql, ...params) {
      const normalized = normalizeParams(params);
      return new Promise((resolve, reject) => {
        rawDb.run(sql, normalized, function runCallback(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        rawDb.exec(sql, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
  };
};

export const getDatabase = () => {
  if (!dbInstance) {
    throw new Error('Database not initialised. Call connectDatabase() first.');
  }
  return dbInstance;
};
