import { app } from './interfaces/http/app.js';
import { env } from './config/env.js';

app.listen(env.API_PORT, () => {
  console.log(`API listening on http://localhost:${env.API_PORT}`);
});
