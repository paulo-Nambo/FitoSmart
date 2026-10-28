import 'dotenv/config';
import { prepararBase } from './base';
import { criarApp } from './app';

const porta = Number(process.env.PORT) || 3001;

prepararBase()
  .then(() => {
    const app = criarApp();
    app.listen(porta, () => {
      console.log(`FitoSmart API em http://localhost:${porta}`);
    });
  })
  .catch((erro: unknown) => {
    const mensagem = erro instanceof Error ? erro.message : 'falha desconhecida';
    console.error(`Não foi possível preparar a base de dados: ${mensagem}`);
    process.exit(1);
  });
