import { scryptSync, timingSafeEqual } from 'crypto';
import type { Perfil } from './tipos';

const SAL_DEMO = 'fitosmart-demo';

export interface Conta {
  email: string;
  hash: Buffer;
  perfil: Perfil;
}

export function hashSenha(senha: string): Buffer {
  return scryptSync(senha, SAL_DEMO, 32);
}

export function senhasIguais(senha: string, hash: Buffer): boolean {
  const calculado = hashSenha(senha);
  return calculado.length === hash.length && timingSafeEqual(calculado, hash);
}

export const HASH_INEXISTENTE = hashSenha('senha-inexistente');

export const CONTAS_INICIAIS: Conta[] = [
  { email: 'agricultor@uem.mz', hash: hashSenha('123456'), perfil: 'AGRICULTOR' },
  { email: 'tecnico@uem.mz', hash: hashSenha('123456'), perfil: 'TECNICO' },
];
