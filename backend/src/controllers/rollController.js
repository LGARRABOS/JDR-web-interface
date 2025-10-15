import { rollDice } from '../utils/dice.js';

/**
 * API endpoint that parses a dice command and returns the total result. Socket
 * events will broadcast the detail to connected clients for synchronized logs.
 */
export const roll = (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ message: 'Commande de dés manquante' });
  }

  const result = rollDice(command);
  return res.json(result);
};
