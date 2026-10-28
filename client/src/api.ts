import type { Sessao } from './sessao';

export interface Ocorrencia {
  id: string;
  cultura: string;
  sintomas: string[];
  latitude: number;
  longitude: number;
  confianca: number;
  status: 'TRIADA' | 'ENCAMINHADA' | 'VALIDADA';
  autorEmail: string | null;
  criadaEm: string;
  imagens: string[];
}

export class ErroApi extends Error {
  readonly estado: number;

  constructor(mensagem: string, estado: number) {
    super(mensagem);
    this.estado = estado;
  }
}

async function pedido<T>(caminho: string, opcoes: RequestInit = {}, token?: string): Promise<T> {
  const cabecalhos = new Headers(opcoes.headers);
  if (opcoes.body) cabecalhos.set('Content-Type', 'application/json');
  if (token) cabecalhos.set('Authorization', `Bearer ${token}`);

  const resposta = await fetch(caminho, { ...opcoes, headers: cabecalhos });
  let dados: { erro?: unknown } = {};
  try {
    dados = (await resposta.json()) as { erro?: unknown };
  } catch {
    dados = {};
  }

  if (!resposta.ok) {
    const mensagem = typeof dados.erro === 'string' ? dados.erro : 'Não foi possível concluir o pedido';
    throw new ErroApi(mensagem, resposta.status);
  }

  return dados as T;
}

export function entrar(email: string, senha: string) {
  return pedido<Sessao>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha }),
  });
}

const listasEmCurso = new Map<string, Promise<{ ocorrencias: Ocorrencia[] }>>();

export function urlDaImagem(id: string, nome: string) {
  return `/api/ocorrencias/${encodeURIComponent(id)}/imagens/${encodeURIComponent(nome)}`;
}

const imagensEmCurso = new Map<string, Promise<Blob>>();

export function obterImagem(token: string, caminho: string) {
  const chave = `${token}:${caminho}`;
  const emCurso = imagensEmCurso.get(chave);
  if (emCurso) return emCurso;

  const consulta = fetch(caminho, { headers: { Authorization: `Bearer ${token}` } })
    .then((resposta) => {
      if (!resposta.ok) throw new ErroApi('Não foi possível ler a fotografia', resposta.status);
      return resposta.blob();
    })
    .catch((erro) => {
      imagensEmCurso.delete(chave);
      throw erro;
    });
  imagensEmCurso.set(chave, consulta);
  return consulta;
}

export function listarOcorrencias(token: string) {
  const emCurso = listasEmCurso.get(token);
  if (emCurso) return emCurso;

  const consulta = pedido<{ ocorrencias: Ocorrencia[] }>('/api/ocorrencias', {}, token).finally(() => {
    listasEmCurso.delete(token);
  });
  listasEmCurso.set(token, consulta);
  return consulta;
}

export function registarOcorrencia(
  token: string,
  corpo: { cultura: string; sintomas: string[]; latitude: number; longitude: number },
) {
  return pedido<{ ocorrencia: Ocorrencia; mensagem?: string }>('/api/ocorrencias', {
    method: 'POST',
    body: JSON.stringify(corpo),
  }, token);
}

export interface Conta {
  email: string;
  perfil: 'AGRICULTOR' | 'TECNICO';
}

const contasEmCurso = new Map<string, Promise<{ utilizadores: Conta[] }>>();

export function listarUtilizadores(token: string) {
  const emCurso = contasEmCurso.get(token);
  if (emCurso) return emCurso;

  const consulta = pedido<{ utilizadores: Conta[] }>('/api/utilizadores', {}, token).finally(() => {
    contasEmCurso.delete(token);
  });
  contasEmCurso.set(token, consulta);
  return consulta;
}

export function criarUtilizador(token: string, corpo: { email: string; senha: string; perfil: Conta['perfil'] }) {
  return pedido<{ utilizador: Conta }>('/api/utilizadores', {
    method: 'POST',
    body: JSON.stringify(corpo),
  }, token);
}

export function actualizarPerfil(token: string, email: string, perfil: Conta['perfil']) {
  return pedido<{ utilizador: Conta }>(`/api/utilizadores/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    body: JSON.stringify({ perfil }),
  }, token);
}

export interface Diagnostico {
  praga: string;
  nomeCientifico: string | null;
  culturaDetectada: string | null;
  sintomas: string[];
  confianca: number;
  recomendacao: string;
  motor: 'openepi' | 'ollama' | 'gemini' | 'fitosmart';
  resumo: string;
  imagensReferencia: string[];
}

export async function diagnosticarImagem(token: string, blob: Blob, cultura: string) {
  const resposta = await fetch(`/api/diagnostico?cultura=${encodeURIComponent(cultura)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
    },
    body: blob,
  });
  let dados: { erro?: unknown; diagnostico?: Diagnostico } = {};
  try {
    dados = (await resposta.json()) as { erro?: unknown; diagnostico?: Diagnostico };
  } catch {
    dados = {};
  }
  if (!resposta.ok) {
    const mensagem = typeof dados.erro === 'string' ? dados.erro : 'Não foi possível diagnosticar a fotografia';
    throw new ErroApi(mensagem, resposta.status);
  }
  if (!dados.diagnostico) {
    throw new ErroApi('A API não devolveu o diagnóstico', resposta.status);
  }
  return dados.diagnostico;
}

export async function enviarImagem(token: string, id: string, blob: Blob) {
  const resposta = await fetch(`/api/ocorrencias/${encodeURIComponent(id)}/imagens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
    },
    body: blob,
  });
  let dados: { erro?: unknown; nome?: unknown } = {};
  try {
    dados = (await resposta.json()) as { erro?: unknown; nome?: unknown };
  } catch {
    dados = {};
  }
  if (!resposta.ok) {
    const mensagem = typeof dados.erro === 'string' ? dados.erro : 'Não foi possível guardar a fotografia';
    throw new ErroApi(mensagem, resposta.status);
  }
  if (typeof dados.nome !== 'string') {
    throw new ErroApi('A API não devolveu o nome da fotografia', resposta.status);
  }
  return dados.nome;
}

export function validarOcorrencia(token: string, id: string) {
  return pedido<{ status: 'VALIDADA'; ocorrencia: Ocorrencia | undefined }>('/api/validacoes', {
    method: 'POST',
    body: JSON.stringify({ id }),
  }, token);
}
