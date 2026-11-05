import { ePerfil, type Perfil } from './perfis';

const CHAVE = 'fitosmart.sessao.v1';

export type { Perfil };

export interface Sessao {
  token: string;
  email: string;
  perfil: Perfil;
  nome?: string;
  organizacao?: string | null;
}

export function lerSessao(): Sessao | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const valor: unknown = JSON.parse(bruto);
    if (!valor || typeof valor !== 'object') return null;
    const candidato = valor as Partial<Sessao>;
    if (typeof candidato.token !== 'string' || typeof candidato.email !== 'string' || !ePerfil(candidato.perfil)) {
      return null;
    }
    return {
      token: candidato.token,
      email: candidato.email,
      perfil: candidato.perfil,
      nome: typeof candidato.nome === 'string' ? candidato.nome : undefined,
      organizacao:
        candidato.organizacao === null
          ? null
          : typeof candidato.organizacao === 'string'
            ? candidato.organizacao
            : undefined,
    };
  } catch {
    return null;
  }
}

export function guardarSessao(sessao: Sessao): void {
  sessionStorage.setItem(CHAVE, JSON.stringify(sessao));
}

export function limparSessao(): void {
  sessionStorage.removeItem(CHAVE);
}
