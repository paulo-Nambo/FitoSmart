export type Perfil = 'AGRICULTOR' | 'TECNICO';

export type EstadoOcorrencia = 'TRIADA' | 'ENCAMINHADA' | 'VALIDADA';

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
