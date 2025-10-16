import path from 'path';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import Map from '../models/Map.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadMap = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Fichier manquant' });
  }
  const map = await Map.create({
    name: req.body.name || req.file.originalname,
    filePath: path.relative(path.join(__dirname, '../../'), req.file.path)
  });
  return res.status(201).json({ map });
};

export const listMaps = async (req, res) => {
  const { search } = req.query;
  const where = search
    ? {
        name: {
          [Op.like]: `%${search}%`
        }
      }
    : undefined;
  const options = {
    order: [['createdAt', 'DESC']]
  };
  if (where) {
    options.where = where;
  }
  const maps = await Map.findAll(options);
  return res.json({ maps });
};
