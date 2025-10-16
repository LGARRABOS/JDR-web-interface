import { io as Client } from 'socket.io-client';
import createApp from '../app.js';

const waitFor = (event, socket) => new Promise((resolve) => socket.once(event, resolve));

describe('Socket.IO integration', () => {
  test('broadcasts token movement to other clients', async () => {
    const { httpServer, start } = createApp();
    await start(0);
    const addressInfo = httpServer.address();
    const port = typeof addressInfo === 'string' ? 0 : addressInfo.port;

    const client1 = new Client(`http://localhost:${port}`, { transports: ['websocket'] });
    const client2 = new Client(`http://localhost:${port}`, { transports: ['websocket'] });

    await Promise.all([waitFor('connect', client1), waitFor('connect', client2)]);

    const movementPayload = { id: 'token-1', x: 10, y: 15 };
    const received = new Promise((resolve) => {
      client2.on('token:move', resolve);
    });

    client1.emit('token:move', movementPayload);

    await expect(received).resolves.toEqual(movementPayload);

    client1.disconnect();
    client2.disconnect();
    await new Promise((resolve) => httpServer.close(resolve));
  });
});
