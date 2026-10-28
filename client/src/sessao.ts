const CHAVE = 'fitosmart.sessao.v1';

export interface Sessao {
  token: string;
  email: string;
  perfil: 'AGRICULTOR' | 'TECNICO';
}

export function lerSessao(): Sessao | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const valor: unknown = JSON.parse(bruto);
    if (!valor || typeof valor !== 'object') return null;
    const candidato = valor as Partial<Sessao>;
    if (
      typeof candidato.token !== 'string' ||
      typeof candidato.email !== 'string' ||
      (candidato.perfil !== 'AGRICULTOR' && candidato.perfil !== 'TECNICO')
    ) {
      return null;
    }
    return { token: candidato.token, email: candidato.email, perfil: candidato.perfil };
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
