import type { Request, Response } from 'express';
import {
  adicionarMensagemApoio,
  actualizarEstadoPedidoApoio,
  criarAvaliacaoTecnico,
  criarPedidoApoio,
  listarPedidosApoio,
  listarRankingTecnicos,
  listarTecnicosDisponiveis,
  obterPedidoApoio,
  obterOcorrencia,
  procurarUtilizador,
} from './base';
import { identificarPedido } from './auth';
import {
  podeAtenderPedidoApoio,
  podeCriarPedidoApoio,
  podeUsarPedidosApoio,
  podeVerTodosPedidosApoio,
} from './perfis';
import type { EstadoPedidoApoio, Estrelas } from './tipos';

const ASSUNTO_MIN = 3;
const ASSUNTO_MAX = 120;
const CORPO_MIN = 3;
const CORPO_MAX = 2000;

const ESTADOS: readonly EstadoPedidoApoio[] = ['ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO'];

function eEstado(valor: unknown): valor is EstadoPedidoApoio {
  return typeof valor === 'string' && (ESTADOS as readonly string[]).includes(valor);
}

function limparTexto(valor: unknown, max: number): string {
  if (typeof valor !== 'string') return '';
  return valor.trim().replace(/\s+/g, ' ').slice(0, max);
}

function limparCorpo(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor.trim().slice(0, CORPO_MAX);
}

function podeVerPedido(
  perfil: Parameters<typeof podeVerTodosPedidosApoio>[0],
  email: string | null,
  autorEmail: string,
): boolean {
  if (podeVerTodosPedidosApoio(perfil)) return true;
  return email !== null && autorEmail === email;
}

export async function listarPedidosHandler(req: Request, res: Response) {
  const identidade = identificarPedido(req);
  if (!identidade?.email || !podeUsarPedidosApoio(identidade.perfil)) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }

  const pedidos = await listarPedidosApoio(identidade.perfil, identidade.email);
  res.json({ pedidos });
}

export async function obterPedidoHandler(req: Request, res: Response) {
  const identidade = identificarPedido(req);
  if (!identidade?.email || !podeUsarPedidosApoio(identidade.perfil)) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }

  const id = typeof req.params.id === 'string' ? req.params.id : '';
  const pedido = await obterPedidoApoio(id);
  if (!pedido || !podeVerPedido(identidade.perfil, identidade.email, pedido.autorEmail)) {
    res.status(404).json({ erro: 'Pedido de apoio não encontrado' });
    return;
  }

  res.json({ pedido });
}

export async function criarPedidoHandler(req: Request, res: Response) {
  const identidade = identificarPedido(req);
  if (!identidade?.email) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }
  if (!podeCriarPedidoApoio(identidade.perfil)) {
    res.status(403).json({ erro: 'Acesso negado: só agricultores abrem pedidos de apoio' });
    return;
  }

  const assunto = limparTexto(req.body?.assunto, ASSUNTO_MAX);
  const mensagem = limparCorpo(req.body?.mensagem);
  const ocorrenciaBruta =
    typeof req.body?.ocorrenciaId === 'string' ? req.body.ocorrenciaId.trim() : '';
  const ocorrenciaId = ocorrenciaBruta.length > 0 ? ocorrenciaBruta : null;
  const tecnicoBruto =
    typeof req.body?.tecnicoEmail === 'string' ? req.body.tecnicoEmail.trim().toLowerCase() : '';
  const tecnicoEmail = tecnicoBruto.length > 0 ? tecnicoBruto : null;

  if (assunto.length < ASSUNTO_MIN) {
    res.status(400).json({ erro: `Assunto deve ter pelo menos ${ASSUNTO_MIN} caracteres` });
    return;
  }
  if (mensagem.length < CORPO_MIN) {
    res.status(400).json({ erro: `Mensagem deve ter pelo menos ${CORPO_MIN} caracteres` });
    return;
  }

  if (!ocorrenciaId) {
    res.status(400).json({ erro: 'Seleccione a ocorrência a que o pedido se refere' });
    return;
  }
  const ocorrencia = await obterOcorrencia(ocorrenciaId);
  if (!ocorrencia || ocorrencia.autorEmail !== identidade.email) {
    res.status(400).json({ erro: 'Ocorrência inválida ou não pertence à sua conta' });
    return;
  }

  if (tecnicoEmail) {
    const tecnico = await procurarUtilizador(tecnicoEmail);
    if (!tecnico || !podeAtenderPedidoApoio(tecnico.perfil)) {
      res.status(400).json({ erro: 'Técnico/agronómio inválido para atribuição' });
      return;
    }
  }

  const pedido = await criarPedidoApoio({
    assunto,
    autorEmail: identidade.email,
    ocorrenciaId,
    mensagem,
    tecnicoEmail,
  });
  res.status(201).json({
    pedido,
    mensagem: tecnicoEmail
      ? 'Pedido de apoio atribuído ao técnico seleccionado.'
      : 'Pedido de apoio enviado aos técnicos.',
  });
}

export async function listarTecnicosHandler(req: Request, res: Response) {
  const identidade = identificarPedido(req);
  if (!identidade?.email || !podeUsarPedidosApoio(identidade.perfil)) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }
  const tecnicos = await listarTecnicosDisponiveis();
  res.json({ tecnicos });
}

export async function responderPedidoHandler(req: Request, res: Response) {
  const identidade = identificarPedido(req);
  if (!identidade?.email || !podeUsarPedidosApoio(identidade.perfil)) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }

  const id = typeof req.params.id === 'string' ? req.params.id : '';
  const corpo = limparCorpo(req.body?.mensagem);
  if (corpo.length < CORPO_MIN) {
    res.status(400).json({ erro: `Mensagem deve ter pelo menos ${CORPO_MIN} caracteres` });
    return;
  }

  const actual = await obterPedidoApoio(id);
  if (!actual || !podeVerPedido(identidade.perfil, identidade.email, actual.autorEmail)) {
    res.status(404).json({ erro: 'Pedido de apoio não encontrado' });
    return;
  }

  const eAutor = actual.autorEmail === identidade.email;
  const eTecnico = podeAtenderPedidoApoio(identidade.perfil);
  if (!eAutor && !eTecnico) {
    res.status(403).json({ erro: 'Acesso negado' });
    return;
  }

  if (actual.estado === 'ENCERRADO' && eTecnico && !eAutor) {
    res.status(400).json({ erro: 'Pedido encerrado. Reabra-o antes de responder.' });
    return;
  }

  let estado: EstadoPedidoApoio | undefined;
  let tecnicoEmail: string | null | undefined;

  if (eTecnico && !eAutor) {
    if (actual.estado === 'ABERTO') estado = 'EM_ATENDIMENTO';
    if (!actual.tecnicoEmail) tecnicoEmail = identidade.email;
  } else if (eAutor && actual.estado === 'ENCERRADO') {
    estado = 'ABERTO';
  }

  const pedido = await adicionarMensagemApoio({
    pedidoId: id,
    autorEmail: identidade.email,
    corpo,
    estado,
    tecnicoEmail,
  });
  res.json({ pedido });
}

export async function actualizarPedidoHandler(req: Request, res: Response) {
  const identidade = identificarPedido(req);
  if (!identidade?.email) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }
  if (!podeAtenderPedidoApoio(identidade.perfil)) {
    res.status(403).json({ erro: 'Acesso negado: só técnicos/gestores alteram o estado' });
    return;
  }

  const id = typeof req.params.id === 'string' ? req.params.id : '';
  const estado = req.body?.estado;
  if (!eEstado(estado)) {
    res.status(400).json({ erro: 'Estado inválido' });
    return;
  }

  const actual = await obterPedidoApoio(id);
  if (!actual) {
    res.status(404).json({ erro: 'Pedido de apoio não encontrado' });
    return;
  }

  const tecnicoEmail =
    estado === 'EM_ATENDIMENTO' || estado === 'ENCERRADO'
      ? actual.tecnicoEmail ?? identidade.email
      : undefined;

  const pedido = await actualizarEstadoPedidoApoio(id, estado, tecnicoEmail);
  res.json({ pedido });
}

export async function avaliarPedidoHandler(req: Request, res: Response) {
  const identidade = identificarPedido(req);
  if (!identidade?.email) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }
  if (!podeCriarPedidoApoio(identidade.perfil)) {
    res.status(403).json({ erro: 'Acesso negado: só o agricultor avalia a assistência' });
    return;
  }

  const id = typeof req.params.id === 'string' ? req.params.id : '';
  const estrelasBrutas = Number(req.body?.estrelas);
  const estrelas = ([1, 2, 3, 4, 5] as const).includes(estrelasBrutas as Estrelas)
    ? (estrelasBrutas as Estrelas)
    : null;
  const comentarioBruto = limparCorpo(req.body?.comentario);
  const comentario = comentarioBruto.length > 0 ? comentarioBruto.slice(0, 500) : null;

  if (!estrelas) {
    res.status(400).json({ erro: 'Indique entre 1 e 5 estrelas' });
    return;
  }

  const pedido = await obterPedidoApoio(id);
  if (!pedido || pedido.autorEmail !== identidade.email) {
    res.status(404).json({ erro: 'Pedido de apoio não encontrado' });
    return;
  }
  if (pedido.estado !== 'ENCERRADO') {
    res.status(400).json({ erro: 'Só pode avaliar depois do pedido estar encerrado' });
    return;
  }
  if (!pedido.tecnicoEmail) {
    res.status(400).json({ erro: 'Este pedido ainda não tem técnico associado' });
    return;
  }
  if (pedido.avaliacao) {
    res.status(409).json({ erro: 'Este pedido já foi avaliado' });
    return;
  }

  try {
    const avaliacao = await criarAvaliacaoTecnico({
      pedidoId: pedido.id,
      tecnicoEmail: pedido.tecnicoEmail,
      autorEmail: identidade.email,
      estrelas,
      comentario,
    });
    res.status(201).json({
      avaliacao,
      pedido: { ...pedido, avaliacao },
      mensagem: 'Obrigado. A sua avaliação entrou no ranking dos técnicos.',
    });
  } catch (erro) {
    if (erro instanceof Error && erro.message === 'Pedido já avaliado') {
      res.status(409).json({ erro: 'Este pedido já foi avaliado' });
      return;
    }
    throw erro;
  }
}

export async function rankingTecnicosHandler(req: Request, res: Response) {
  const identidade = identificarPedido(req);
  if (!identidade?.email) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }
  const ranking = await listarRankingTecnicos();
  res.json({ ranking });
}
