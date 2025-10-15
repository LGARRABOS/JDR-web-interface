import bcrypt from 'bcryptjs';
import { getDatabase } from '../utils/db.js';

const mapUserRow = (row) => {
  if (!row) return null;
  return {
    _id: String(row.id),
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password,
    isGameMaster: Boolean(row.isGameMaster),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const findUserByEmailOrUsername = async ({ email, username }) => {
  const db = getDatabase();
  const row = await db.get(
    'SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1',
    email,
    username,
  );
  return mapUserRow(row);
};

export const findUserByIdentifier = async (identifier) => {
  const db = getDatabase();
  const row = await db.get(
    'SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1',
    identifier,
    identifier,
  );
  return mapUserRow(row);
};

export const createUser = async ({ username, email, password, isGameMaster }) => {
  const db = getDatabase();
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await db.run(
    `INSERT INTO users (username, email, password, isGameMaster)
     VALUES (?, ?, ?, ?)`,
    username,
    email,
    hashedPassword,
    isGameMaster ? 1 : 0,
  );
  const row = await db.get('SELECT * FROM users WHERE id = ?', result.lastID);
  return mapUserRow(row);
};
