import type { Perfil } from './perfis';
import type { Sessao } from './sessao';

export type { Perfil };
export type Severidade = 1 | 2 | 3 | 4 | 5;

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
  parcelaId: string | null;
  parcelaNome: string | null;
  referenciaId: string | null;
  referenciaRotulo: string | null;
  severidade: Severidade | null;
  validadaEm: string | null;
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

export function alterarSenha(
  dados: { email: string; senhaActual: string; senhaNova: string },
  token?: string,
) {
  return pedido<{ ok: true; mensagem: string }>(
    '/api/conta/senha',
    {
      method: 'POST',
      body: JSON.stringify(dados),
    },
    token,
  );
}

export function actualizarConta(
  dados: { nome: string; organizacao: string | null },
  token: string,
) {
  return pedido<{
    ok: true;
    mensagem: string;
    utilizador: { email: string; perfil: Perfil; nome: string; organizacao: string | null };
  }>('/api/conta', { method: 'PATCH', body: JSON.stringify(dados) }, token);
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
  corpo: {
    cultura: string;
    sintomas: string[];
    latitude: number;
    longitude: number;
    parcelaNome?: string | null;
    referenciaId?: string | null;
    severidade?: Severidade | null;
  },
) {
  return pedido<{ ocorrencia: Ocorrencia; mensagem?: string }>('/api/ocorrencias', {
    method: 'POST',
    body: JSON.stringify(corpo),
  }, token);
}

export interface Conta {
  email: string;
  perfil: Perfil;
  nome: string;
  organizacao: string | null;
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

export function criarUtilizador(
  token: string,
  corpo: {
    email: string;
    senha: string;
    perfil: Conta['perfil'];
    nome: string;
    organizacao?: string | null;
  },
) {
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

export function obterConfiguracao(token: string) {
  return pedido<{ configuracao: { limiarTriagem: number } }>('/api/configuracao', {}, token);
}

export function actualizarConfiguracao(token: string, limiarTriagem: number) {
  return pedido<{ configuracao: { limiarTriagem: number } }>('/api/configuracao', {
    method: 'PATCH',
    body: JSON.stringify({ limiarTriagem }),
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
  referenciaId: string | null;
  hipotese: boolean;
  alternativas: string[];
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
  const bruto = dados.diagnostico;
  return {
    ...bruto,
    hipotese:
      typeof bruto.hipotese === 'boolean'
        ? bruto.hipotese
        : /hipótese|por confirmar/i.test(bruto.praga) || bruto.confianca < 60,
    alternativas: Array.isArray(bruto.alternativas)
      ? bruto.alternativas.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
  };
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
