/** Espelho das regras de senha do servidor. */
export const SENHA_MIN_LOGIN = 6;
export const SENHA_MIN_NOVA = 8;

export interface RegraSenha {
  id: 'tamanho' | 'letra' | 'numero' | 'simbolo';
  rotulo: string;
  ok: boolean;
}

export function senhaValida(senha: string): boolean {
  return typeof senha === 'string' && senha.length >= SENHA_MIN_LOGIN;
}

export function avaliarSenhaNova(senha: string): RegraSenha[] {
  const texto = typeof senha === 'string' ? senha : '';
  return [
    { id: 'tamanho', rotulo: 'Pelo menos 8 caracteres', ok: texto.length >= SENHA_MIN_NOVA },
    { id: 'letra', rotulo: 'Pelo menos uma letra', ok: /[A-Za-zÀ-ÿ]/.test(texto) },
    { id: 'numero', rotulo: 'Pelo menos um número', ok: /\d/.test(texto) },
    { id: 'simbolo', rotulo: 'Pelo menos um símbolo (!@#…)', ok: /[^A-Za-zÀ-ÿ0-9\s]/.test(texto) },
  ];
}

export function senhaNovaValida(senha: string): boolean {
  return avaliarSenhaNova(senha).every((regra) => regra.ok);
}

export function mensagemSenhaNovaInvalida(senha: string): string {
  const falhas = avaliarSenhaNova(senha).filter((regra) => !regra.ok);
  if (falhas.length === 0) return '';
  return `A nova senha deve cumprir: ${falhas.map((regra) => regra.rotulo.toLowerCase()).join('; ')}.`;
}
