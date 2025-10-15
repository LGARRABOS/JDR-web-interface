import path from 'path';
import { Map } from '../models/Map.js';

/**
 * Handle an uploaded map image, create the database entry and return the stored
 * map meta data. Future iterations can associate multiple maps per campaign.
 */
export const uploadMap = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier fourni' });
  }

  const { originalname, filename } = req.file;
  const campaignId = req.body.campaignId || 'default';
  const safeName = req.body.name || originalname;

  try {
    const map = await Map.create({
      name: safeName,
      imagePath: path.posix.join('uploads', filename),
      campaignId,
    });

    return res.status(201).json(map);
  } catch (error) {
    console.error('[Map] Upload error', error);
    return res.status(500).json({ message: "Erreur lors de l'upload de la carte" });
  }
};
