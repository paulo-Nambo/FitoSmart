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
