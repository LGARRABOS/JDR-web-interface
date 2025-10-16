import fs from 'fs';
import os from 'os';
import path from 'path';
import supertest from 'supertest';
import createApp from '../app.js';

const registerMJ = async () => {
  const { app } = createApp();
  const agent = supertest.agent(app);
  await agent
    .post('/api/auth/register')
    .send({ username: 'mj', email: 'mj@example.com', password: 'secret', role: 'MJ' })
    .expect(201);
  return agent;
};

describe('Map upload', () => {
  test('allows MJ to upload a map', async () => {
    const agent = await registerMJ();
    const tmpFile = path.join(os.tmpdir(), 'test-map.png');
    fs.writeFileSync(tmpFile, 'fake-image');

    const response = await agent
      .post('/api/maps/upload')
      .attach('map', tmpFile)
      .field('name', 'Dungeon')
      .expect(201);

    expect(response.body.map.name).toBe('Dungeon');
    expect(fs.existsSync(path.join(process.cwd(), 'chronicles-of-eternita/backend', response.body.map.filePath))).toBe(true);
  });
});
