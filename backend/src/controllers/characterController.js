import { Character } from '../models/Character.js';

const isOwnerOrGameMaster = (character, user) =>
  character.owner?.toString() === user.id || user.isGameMaster;

/**
 * Retrieve all characters for the current campaign. In the future this can be
 * filtered per campaign or per room using query parameters.
 */
export const getCharacters = async (req, res) => {
  const campaignId = req.query.campaignId || 'default';

  try {
    const characters = await Character.find({ campaignId }).sort({ createdAt: 1 });
    return res.json(characters);
  } catch (error) {
    console.error('[Character] Fetch error', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des personnages' });
  }
};

/**
 * Create a new character sheet. MJ can create characters for NPCs while players
 * can manage their own sheets.
 */
export const createCharacter = async (req, res) => {
  const { name, health, mana, imageUrl, campaignId = 'default' } = req.body;

  try {
    const character = await Character.create({
      name,
      health,
      mana,
      imageUrl,
      owner: req.user.id,
      campaignId,
    });

    return res.status(201).json(character);
  } catch (error) {
    console.error('[Character] Create error', error);
    return res.status(500).json({ message: 'Erreur lors de la création du personnage' });
  }
};

/**
 * Update an existing character sheet. Only the owner or the game master can
 * perform the update to prevent tampering between players.
 */
export const updateCharacter = async (req, res) => {
  const { id } = req.params;
  const { name, health, mana, imageUrl } = req.body;

  try {
    const character = await Character.findById(id);

    if (!character) {
      return res.status(404).json({ message: 'Personnage introuvable' });
    }

    if (!isOwnerOrGameMaster(character, req.user)) {
      return res.status(403).json({ message: 'Action non autorisée' });
    }

    character.name = name ?? character.name;
    character.health = health ?? character.health;
    character.mana = mana ?? character.mana;
    character.imageUrl = imageUrl ?? character.imageUrl;

    await character.save();

    return res.json(character);
  } catch (error) {
    console.error('[Character] Update error', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du personnage' });
  }
};
