import dotenv from 'dotenv';
import createApp from './src/app.js';

dotenv.config({ path: new URL('./.env', import.meta.url).pathname });

const { start } = createApp();

const port = process.env.PORT || 4000;

start(port).then(({ port: listeningPort }) => {
  // eslint-disable-next-line no-console
  console.log(`Chronicles of Eternita backend listening on port ${listeningPort}`);
});
