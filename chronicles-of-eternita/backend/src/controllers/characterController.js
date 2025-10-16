import Character from '../models/Character.js';
import User from '../models/User.js';

export const listCharacters = async (req, res) => {
  const characters = await Character.findAll({
    include: [{ model: User, attributes: ['id', 'username', 'role'] }]
  });
  return res.json({ characters });
};

export const createCharacter = async (req, res) => {
  try {
    const { name, hp, mana, speed, image, userId } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Nom requis' });
    }
    const ownerId = req.session.user.role === 'MJ' && userId ? userId : req.session.user.id;
    const character = await Character.create({
      name,
      hp: Number.isInteger(Number(hp)) ? Number(hp) : 0,
      mana: Number.isInteger(Number(mana)) ? Number(mana) : 0,
      speed: Number.isInteger(Number(speed)) ? Number(speed) : 0,
      image: image || null,
      userId: ownerId
    });
    return res.status(201).json({ character });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateCharacter = async (req, res) => {
  try {
    const { id } = req.params;
    const character = await Character.findByPk(id);
    if (!character) {
      return res.status(404).json({ message: 'Personnage introuvable' });
    }
    if (req.session.user.role !== 'MJ' && req.session.user.id !== character.userId) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    const { name, hp, mana, speed, image } = req.body;
    character.name = name ?? character.name;
    character.hp = Number.isInteger(Number(hp)) ? Number(hp) : character.hp;
    character.mana = Number.isInteger(Number(mana)) ? Number(mana) : character.mana;
    character.speed = Number.isInteger(Number(speed)) ? Number(speed) : character.speed;
    character.image = image ?? character.image;
    await character.save();
    return res.json({ character });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
