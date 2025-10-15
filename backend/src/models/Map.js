import { getDatabase } from '../utils/db.js';

const mapMapRow = (row) => {
  if (!row) return null;
  let parsedState = {};
  if (row.state) {
    try {
      parsedState = JSON.parse(row.state);
    } catch (error) {
      parsedState = {};
    }
  }

  return {
    _id: String(row.id),
    id: row.id,
    name: row.name,
    imagePath: row.imagePath,
    campaignId: row.campaignId,
    state: parsedState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const createMap = async ({ name, imagePath, campaignId }) => {
  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO maps (name, imagePath, campaignId)
     VALUES (?, ?, ?)`,
    name,
    imagePath,
    campaignId,
  );
  const row = await db.get('SELECT * FROM maps WHERE id = ?', result.lastID);
  return mapMapRow(row);
};
