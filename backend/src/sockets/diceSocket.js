import { rollDice } from '../utils/dice.js';

/**
 * Handle dice rolling events through Socket.IO so every connected player can
 * see the same result broadcasted instantly.
 */
export const registerDiceSocket = (io) => {
  const namespace = io.of('/dice');

  namespace.on('connection', (socket) => {
    console.log('[Socket] Dice client connected');

    socket.on('join-campaign', (campaignId = 'default') => {
      socket.join(campaignId);
      socket.campaignId = campaignId;
    });

    socket.on('roll', (command) => {
      const result = rollDice(command);
      const room = socket.campaignId || 'default';
      namespace.to(room).emit('rolled', { command, result, author: socket.id });
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Dice client disconnected');
    });
  });
};
