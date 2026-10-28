import 'dotenv/config';
import { criarApp } from './app';

const porta = Number(process.env.PORT) || 3001;
const app = criarApp();

app.listen(porta, () => {
  console.log(`FitoSmart API em http://localhost:${porta}`);
});
