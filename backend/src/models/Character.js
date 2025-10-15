import { getDatabase } from '../utils/db.js';

const mapCharacterRow = (row) => {
  if (!row) return null;
  return {
    _id: String(row.id),
    id: row.id,
    name: row.name,
    health: row.health,
    mana: row.mana,
    imageUrl: row.imageUrl,
    owner: row.ownerId ? String(row.ownerId) : null,
    ownerId: row.ownerId,
    campaignId: row.campaignId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const listCharacters = async (campaignId) => {
  const db = getDatabase();
  const rows = await db.all(
    'SELECT * FROM characters WHERE campaignId = ? ORDER BY datetime(createdAt) ASC',
    campaignId,
  );
  return rows.map(mapCharacterRow);
};

export const createCharacter = async ({
  name,
  health = 0,
  mana = 0,
  imageUrl,
  ownerId,
  campaignId,
}) => {
  const db = getDatabase();
  const normalizedHealth = Number.isFinite(Number(health)) ? Number(health) : 0;
  const normalizedMana = Number.isFinite(Number(mana)) ? Number(mana) : 0;
  const result = await db.run(
    `INSERT INTO characters (name, health, mana, imageUrl, ownerId, campaignId)
     VALUES (?, ?, ?, ?, ?, ?)`,
    name,
    normalizedHealth,
    normalizedMana,
    imageUrl ?? null,
    ownerId ?? null,
    campaignId,
  );
  const row = await db.get('SELECT * FROM characters WHERE id = ?', result.lastID);
  return mapCharacterRow(row);
};

export const findCharacterById = async (id) => {
  const db = getDatabase();
  const row = await db.get('SELECT * FROM characters WHERE id = ?', id);
  return mapCharacterRow(row);
};

export const updateCharacterById = async (id, updates) => {
  const db = getDatabase();
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.health !== undefined) {
    fields.push('health = ?');
    values.push(Number.isFinite(Number(updates.health)) ? Number(updates.health) : 0);
  }
  if (updates.mana !== undefined) {
    fields.push('mana = ?');
    values.push(Number.isFinite(Number(updates.mana)) ? Number(updates.mana) : 0);
  }
  if (updates.imageUrl !== undefined) {
    fields.push('imageUrl = ?');
    values.push(updates.imageUrl);
  }

  if (fields.length === 0) {
    return findCharacterById(id);
  }

  fields.push('updatedAt = CURRENT_TIMESTAMP');

  await db.run(
    `UPDATE characters SET ${fields.join(', ')} WHERE id = ?`,
    ...values,
    id,
  );

  return findCharacterById(id);
};
