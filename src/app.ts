import path from 'path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { actualizarPerfilHandler, criarUtilizadorHandler, listarUtilizadoresHandler } from './acesso';
import {
  actualizarPedidoHandler,
  avaliarPedidoHandler,
  criarPedidoHandler,
  listarPedidosHandler,
  listarTecnicosHandler,
  obterPedidoHandler,
  rankingTecnicosHandler,
  responderPedidoHandler,
} from './apoio';
import { actualizarContaHandler, alterarSenhaHandler, loginHandler } from './auth';
import { actualizarConfiguracaoHandler, obterConfiguracaoHandler } from './configuracao';
import {
  historicoOcorrenciaHandler,
  listarOcorrenciasHandler,
  registrarOcorrenciaHandler,
  validarTecnicoHandler,
} from './fitossanidade';
import { diagnosticoHandler } from './diagnostico';
import { guardarImagemHandler, servirImagemHandler } from './imagens';
import { servirReferenciaHandler } from './referencias-http';

function limitePedidos(
  max: number,
  janelaMs: number,
  opcoes?: { skip?: (req: Request) => boolean },
) {
  const emTeste = process.env.NODE_ENV === 'test';
  return rateLimit({
    windowMs: janelaMs,
    max: emTeste ? 10_000 : max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Demasiados pedidos. Aguarde alguns minutos e tente de novo.' },
    skip: opcoes?.skip,
  });
}

export function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", 'https:'],
          workerSrc: ["'self'", 'blob:'],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(express.json({ limit: '16kb' }));
  const origensPadrao = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5176',
    'http://127.0.0.1:5176',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
  ];
  const origensEnv = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  app.use(
    cors({
      // Em produção o React é servido pelo mesmo Express (mesma origem).
      // CORS_ORIGIN permite front separado (ex.: pré-visualização).
      origin: origensEnv.length > 0 ? origensEnv : origensPadrao,
    }),
  );

  const janela15m = 15 * 60 * 1000;
  const limiteGlobalApi = limitePedidos(300, janela15m, {
    // Health check do Render / monitorização não deve ser bloqueado.
    skip: (req) => req.path === '/saude' || req.path === '/saude/',
  });
  const limiteLogin = limitePedidos(20, janela15m);
  const limiteSenha = limitePedidos(15, janela15m);
  const limiteDiagnostico = limitePedidos(40, janela15m);
  const limiteUploadImagem = limitePedidos(20, janela15m);
  const limiteServirImagem = limitePedidos(120, janela15m);
  const limiteReferencias = limitePedidos(200, janela15m);
  const limitePedidosApoio = limitePedidos(60, janela15m);

  // Tecto geral por IP em toda a API (rotas sensíveis têm limites mais baixos abaixo).
  app.use('/api', limiteGlobalApi);

  app.get('/api/saude', (_req, res) => {
    res.json({ estado: 'ok' });
  });
  app.post('/api/login', limiteLogin, loginHandler);
  app.post('/api/conta/senha', limiteSenha, alterarSenhaHandler);
  app.patch('/api/conta', actualizarContaHandler);
  app.get('/api/ocorrencias', listarOcorrenciasHandler);
  app.post('/api/ocorrencias', registrarOcorrenciaHandler);
  app.get('/api/ocorrencias/:id/historico', historicoOcorrenciaHandler);
  app.post(
    '/api/diagnostico',
    limiteDiagnostico,
    express.raw({ type: 'image/jpeg', limit: '2mb' }),
    diagnosticoHandler,
  );
  app.post(
    '/api/ocorrencias/:id/imagens',
    limiteUploadImagem,
    express.raw({ type: 'image/jpeg', limit: '2mb' }),
    guardarImagemHandler,
  );
  app.get('/api/ocorrencias/:id/imagens/:nome', limiteServirImagem, servirImagemHandler);
  app.post('/api/validacoes', validarTecnicoHandler);
  app.get('/api/utilizadores', listarUtilizadoresHandler);
  app.post('/api/utilizadores', criarUtilizadorHandler);
  app.patch('/api/utilizadores/:email', actualizarPerfilHandler);
  app.get('/api/configuracao', obterConfiguracaoHandler);
  app.patch('/api/configuracao', actualizarConfiguracaoHandler);
  app.get('/api/tecnicos', listarTecnicosHandler);
  app.get('/api/pedidos', listarPedidosHandler);
  app.post('/api/pedidos', limitePedidosApoio, criarPedidoHandler);
  app.get('/api/pedidos/:id', obterPedidoHandler);
  app.post('/api/pedidos/:id/mensagens', limitePedidosApoio, responderPedidoHandler);
  app.patch('/api/pedidos/:id', actualizarPedidoHandler);
  app.post('/api/pedidos/:id/avaliacao', limitePedidosApoio, avaliarPedidoHandler);
  app.get('/api/ranking/tecnicos', rankingTecnicosHandler);

  // Com DATABASE_URL: imagens vêm da BD; sem BD (ou miss): ficheiros em public/.
  app.get('/referencias/:entradaId/:nome', limiteReferencias, servirReferenciaHandler);
  const pastaReferencias = path.join(__dirname, '..', 'client', 'public', 'referencias');
  app.use('/referencias', limiteReferencias, express.static(pastaReferencias));

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
    if (erro.type === 'entity.too.large') {
      res.status(413).json({ erro: 'A fotografia é demasiado grande. Use até 2 MB.' });
      return;
    }
    res.status(500).json({ erro: 'Erro interno' });
  });

  return app;
}
