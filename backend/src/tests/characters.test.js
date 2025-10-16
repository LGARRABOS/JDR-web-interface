import supertest from 'supertest';
import createApp from '../app.js';

const registerAndLogin = async (role = 'player') => {
  const { app } = createApp();
  const agent = supertest.agent(app);
  await agent
    .post('/api/auth/register')
    .send({ username: role, email: `${role}@example.com`, password: 'secret', role })
    .expect(201);
  return agent;
};

describe('Character routes', () => {
  test('rejects unauthenticated access', async () => {
    const { app } = createApp();
    await supertest(app).get('/api/characters').expect(401);
  });

  test('creates a character for the connected user', async () => {
    const agent = await registerAndLogin('player');
    const response = await agent
      .post('/api/characters')
      .send({ name: 'Elandra', hp: 15, mana: 8 })
      .expect(201);

    expect(response.body.character).toMatchObject({ name: 'Elandra', hp: 15, mana: 8 });

    const list = await agent.get('/api/characters').expect(200);
    expect(list.body.characters).toHaveLength(1);
  });

  test('MJ peut créer un personnage pour un joueur', async () => {
    const mjAgent = await registerAndLogin('MJ');
    const response = await mjAgent
      .post('/api/characters')
      .send({ name: 'Guardian', hp: 20, mana: 5, userId: 999 })
      .expect(201);

    expect(response.body.character.userId).toBe(1);
  });

  test('MJ peut mettre à jour un personnage', async () => {
    const mjAgent = await registerAndLogin('MJ');
    const created = await mjAgent
      .post('/api/characters')
      .send({ name: 'Sentinel', hp: 12, mana: 4 })
      .expect(201);

    const updated = await mjAgent
      .put(`/api/characters/${created.body.character.id}`)
      .send({ hp: 18, mana: 10 })
      .expect(200);

    expect(updated.body.character.hp).toBe(18);
    expect(updated.body.character.mana).toBe(10);
  });
});
