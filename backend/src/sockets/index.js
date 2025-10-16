import { rollDice } from '../utils/dice.js';

export const initSockets = (io) => {
  io.on('connection', (socket) => {
    socket.on('token:move', (payload) => {
      socket.broadcast.emit('token:move', payload);
    });

    socket.on('map:update', (payload) => {
      socket.broadcast.emit('map:update', payload);
    });

    socket.on('dice:roll', (expression) => {
      try {
        const result = rollDice(expression);
        io.emit('dice:result', { expression, result, actor: socket.handshake.session?.user?.username || 'Anonyme' });
      } catch (error) {
        socket.emit('dice:error', error.message);
      }
    });
  });
};
