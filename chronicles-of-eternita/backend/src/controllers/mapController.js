import path from 'path';
import { fileURLToPath } from 'url';
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
