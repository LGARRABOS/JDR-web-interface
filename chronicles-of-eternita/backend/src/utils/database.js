import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = process.env.NODE_ENV === 'test'
  ? path.join(__dirname, '../../test.sqlite')
  : path.join(__dirname, '../../database.sqlite');

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage,
  logging: false
});

export const connectDatabase = async () => {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
};

export const resetDatabase = async () => {
  await sequelize.drop();
  await sequelize.sync();
};
