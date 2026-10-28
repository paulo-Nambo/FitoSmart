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

export function validarOcorrencia(token: string, id: string) {
  return pedido<{ status: 'VALIDADA'; ocorrencia: Ocorrencia | undefined }>('/api/validacoes', {
    method: 'POST',
    body: JSON.stringify({ id }),
  }, token);
}
