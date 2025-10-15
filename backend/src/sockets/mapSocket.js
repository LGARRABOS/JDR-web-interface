/**
 * Register Socket.IO events related to map synchronisation. The structure keeps
 * the logic encapsulated so new namespaces can be added without cluttering
 * server.js.
 */
export const registerMapSocket = (io) => {
  const namespace = io.of('/map');

  namespace.on('connection', (socket) => {
    console.log('[Socket] Map client connected');

    socket.on('join-campaign', (campaignId = 'default') => {
      socket.join(campaignId);
      socket.campaignId = campaignId;
    });

    socket.on('token-update', (payload) => {
      const room = socket.campaignId || 'default';
      socket.to(room).emit('token-update', payload);
    });

    socket.on('map-state', (payload) => {
      const room = socket.campaignId || 'default';
      socket.to(room).emit('map-state', payload);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Map client disconnected');
    });
  });
};
