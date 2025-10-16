import { rollDice } from '../utils/dice.js';
import { getSocketServer } from '../sockets/io.js';

export const roll = (req, res) => {
  const { expression } = req.body;
  if (!expression) {
    return res.status(400).json({ message: 'Expression requise' });
  }
  try {
    const result = rollDice(expression);
    const io = getSocketServer();
    io?.emit('dice:result', {
      expression,
      result,
      actor: req.session?.user?.username || 'Anonyme'
    });
    return res.json({ result });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
