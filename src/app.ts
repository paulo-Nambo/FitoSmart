import path from 'path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { loginHandler } from './auth';
import {
  listarOcorrenciasHandler,
  registrarOcorrenciaHandler,
  validarTecnicoHandler,
} from './fitossanidade';

export function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    }),
  );

  app.get('/api/saude', (_req, res) => {
    res.json({ estado: 'ok' });
  });
  app.post('/api/login', loginHandler);
  app.get('/api/ocorrencias', listarOcorrenciasHandler);
  app.post('/api/ocorrencias', registrarOcorrenciaHandler);
  app.post('/api/validacoes', validarTecnicoHandler);

  const pastaCliente = path.join(__dirname, '..', 'dist', 'client');
  app.use(express.static(pastaCliente));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ erro: 'Rota não encontrada' });
      return;
    }
    res.sendFile(path.join(pastaCliente, 'index.html'), (erro) => {
      if (erro) next();
    });
  });

  app.use((erro: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(erro);
      return;
    }
    if (erro.type === 'entity.parse.failed') {
      res.status(400).json({ erro: 'JSON inválido' });
      return;
    }
    res.status(500).json({ erro: 'Erro interno' });
  });

  return app;
}
