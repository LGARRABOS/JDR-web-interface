import supertest from 'supertest';
import bcrypt from 'bcrypt';
import createApp from '../app.js';
import User from '../models/User.js';

const buildAgent = () => {
  const { app } = createApp();
  return supertest.agent(app);
};

describe('Auth routes', () => {
  test('registers a user and returns a session cookie', async () => {
    const agent = buildAgent();
    const response = await agent
      .post('/api/auth/register')
      .send({ username: 'alice', email: 'alice@example.com', password: 'secret', role: 'MJ' })
      .expect(201);

    expect(response.body.user).toMatchObject({ username: 'alice', email: 'alice@example.com', role: 'MJ' });
    expect(response.headers['set-cookie']).toBeDefined();
  });

  test('logs in an existing user', async () => {
    const passwordHash = await bcrypt.hash('secret', 10);
    await User.create({ username: 'bob', email: 'bob@example.com', passwordHash, role: 'player' });
    const agent = buildAgent();

    const response = await agent
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'secret' })
      .expect(200);

    expect(response.body.user).toMatchObject({ username: 'bob', role: 'player' });
  });

  test('logout clears the session', async () => {
    const agent = buildAgent();
    await agent
      .post('/api/auth/register')
      .send({ username: 'charlie', email: 'charlie@example.com', password: 'secret' })
      .expect(201);

    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });
});
