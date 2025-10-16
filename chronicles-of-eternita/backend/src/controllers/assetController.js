import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import Asset from '../models/Asset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadAsset = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Fichier manquant' });
  }

  const asset = await Asset.create({
    name: req.body.name || req.file.originalname,
    category: req.body.category || 'token',
    filePath: path.relative(path.join(__dirname, '../../'), req.file.path)
  });

  return res.status(201).json({ asset });
};

export const listAssets = async (req, res) => {
  const { category, search } = req.query;

  const where = {};

  if (category) {
    where.category = category;
  }

  if (search) {
    where.name = {
      [Op.like]: `%${search}%`
    };
  }

  const assets = await Asset.findAll({
    where,
    order: [['createdAt', 'DESC']]
  });

  return res.json({ assets });
};

export const deleteAsset = async (req, res) => {
  const { id } = req.params;
  const asset = await Asset.findByPk(id);

  if (!asset) {
    return res.status(404).json({ message: 'Ressource introuvable' });
  }

  const absolutePath = path.join(__dirname, '../../', asset.filePath);
  if (fs.existsSync(absolutePath)) {
    await fs.promises.unlink(absolutePath).catch(() => {});
  }

  await asset.destroy();
  return res.status(204).send();
};
