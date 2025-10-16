process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test_secret';
process.env.UPLOAD_DIR = 'uploads';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resetDatabase, sequelize } from '../utils/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../../uploads');

beforeAll(async () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  await resetDatabase();
});

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await sequelize.close();
  if (fs.existsSync(path.join(__dirname, '../../test.sqlite'))) {
    fs.rmSync(path.join(__dirname, '../../test.sqlite'));
  }
});
