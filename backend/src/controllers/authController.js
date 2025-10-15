import bcrypt from 'bcryptjs';
import {
  createUser,
  findUserByEmailOrUsername,
  findUserByIdentifier,
} from '../models/User.js';
import { generateToken } from '../utils/jwt.js';

const formatAuthPayload = (user) => ({
  user: {
    id: user._id,
    username: user.username,
    email: user.email,
    isGameMaster: user.isGameMaster,
  },
  token: generateToken({
    id: user._id,
    username: user.username,
    isGameMaster: user.isGameMaster,
  }),
});

/**
 * Register a new user. The first registered account can become the default MJ
 * when desired by setting isGameMaster to true in the request body.
 */
export const register = async (req, res) => {
  const { username, email, password, isGameMaster = false } = req.body;

  try {
    const existingUser = await findUserByEmailOrUsername({ email, username });

    if (existingUser) {
      return res.status(409).json({ message: 'Utilisateur déjà existant' });
    }

    const user = await createUser({ username, email, password, isGameMaster });

    return res.status(201).json(formatAuthPayload(user));
  } catch (error) {
    console.error('[Auth] Register error', error);
    return res.status(500).json({ message: "Erreur lors de l'inscription" });
  }
};

/**
 * Authenticate an existing user using email or username and password.
 */
export const login = async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const user = await findUserByIdentifier(identifier);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Mot de passe incorrect' });
    }

    return res.json(formatAuthPayload(user));
  } catch (error) {
    console.error('[Auth] Login error', error);
    return res.status(500).json({ message: 'Erreur lors de la connexion' });
  }
};
