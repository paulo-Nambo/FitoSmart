export type { Perfil } from './perfis';
import type { Perfil } from './perfis';

export interface ContaPublica {
  email: string;
  perfil: Perfil;
  /** Pessoa a quem a conta pertence. */
  nome: string;
  /** Organização / unidade (ex.: UEM · Maputo). */
  organizacao: string | null;
}

export type EstadoOcorrencia = 'TRIADA' | 'ENCAMINHADA' | 'VALIDADA';

/** Escala 1–5 (inspirada em Quantities do farmOS): área/plantas afectadas. */
export type Severidade = 1 | 2 | 3 | 4 | 5;

export interface Parcela {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  autorEmail: string | null;
  criadaEm: string;
}

export interface EventoOcorrencia {
  id: string;
  ocorrenciaId: string;
  deStatus: EstadoOcorrencia | null;
  paraStatus: EstadoOcorrencia;
  actorEmail: string | null;
  nota: string | null;
  criadoEm: string;
}

export interface Ocorrencia {
  id: string;
  cultura: string;
  sintomas: string[];
  latitude: number;
  longitude: number;
  confianca: number;
  status: EstadoOcorrencia;
  autorEmail: string | null;
  /** Nome do titular da conta autora, quando conhecido. */
  autorNome: string | null;
  criadaEm: string;
  imagens: string[];
  parcelaId: string | null;
  parcelaNome: string | null;
  referenciaId: string | null;
  referenciaRotulo: string | null;
  severidade: Severidade | null;
  validadaEm: string | null;
  notaValidacao: string | null;
  validadaPor: string | null;
}

export interface CamposOcorrencia {
  cultura: string;
  sintomas: string[];
  latitude: number;
  longitude: number;
}

export interface ResultadoTriagem {
  confianca: number;
  status: Extract<EstadoOcorrencia, 'TRIADA' | 'ENCAMINHADA'>;
}

export type EstadoPedidoApoio = 'ABERTO' | 'EM_ATENDIMENTO' | 'ENCERRADO';

export interface MensagemApoio {
  id: string;
  pedidoId: string;
  autorEmail: string;
  corpo: string;
  criadoEm: string;
}

export interface PedidoApoio {
  id: string;
  assunto: string;
  estado: EstadoPedidoApoio;
  autorEmail: string;
  tecnicoEmail: string | null;
  ocorrenciaId: string | null;
  criadoEm: string;
  actualizadoEm: string;
  mensagens?: MensagemApoio[];
  preview?: string | null;
  avaliacao?: AvaliacaoTecnico | null;
}

export type Estrelas = 1 | 2 | 3 | 4 | 5;

export interface AvaliacaoTecnico {
  id: string;
  pedidoId: string;
  tecnicoEmail: string;
  autorEmail: string;
  estrelas: Estrelas;
  comentario: string | null;
  criadoEm: string;
}

export interface RankingTecnico {
  email: string;
  nome: string;
  media: number;
  total: number;
}
