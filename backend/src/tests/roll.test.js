import supertest from 'supertest';
import createApp from '../app.js';

const registerPlayer = async () => {
  const { app } = createApp();
  const agent = supertest.agent(app);
  await agent
    .post('/api/auth/register')
    .send({ username: 'roller', email: 'roller@example.com', password: 'secret' })
    .expect(201);
  return agent;
};

describe('Dice roll API', () => {
  test('returns a valid dice result', async () => {
    const agent = await registerPlayer();
    const response = await agent
      .post('/api/roll')
      .send({ expression: '/roll 1d6+2' })
      .expect(200);

    expect(response.body.result.total).toBeGreaterThanOrEqual(3);
    expect(response.body.result.total).toBeLessThanOrEqual(8);
  });

  test('rejects invalid expressions', async () => {
    const agent = await registerPlayer();
    await agent.post('/api/roll').send({ expression: 'invalid' }).expect(400);
  });
});
