import { scryptSync, timingSafeEqual } from 'crypto';
import type { Perfil } from './perfis';

const SAL_DEMO = 'fitosmart-demo';

export interface Conta {
  email: string;
  hash: Buffer;
  perfil: Perfil;
  nome: string;
  organizacao: string | null;
}

export function hashSenha(senha: string): Buffer {
  return scryptSync(senha, SAL_DEMO, 32);
}

export function senhasIguais(senha: string, hash: Buffer): boolean {
  const calculado = hashSenha(senha);
  return calculado.length === hash.length && timingSafeEqual(calculado, hash);
}

export const HASH_INEXISTENTE = hashSenha('senha-inexistente');

/** Única conta de arranque: administrador do sistema. */
export const CONTA_ADMIN_SISTEMA = {
  email: 'paulo.baltazar@uem.mz',
  senha: 'FitoSmart1!',
  perfil: 'ADMIN_SISTEMA' as const,
  nome: 'Paulo Baltazar',
  organizacao: 'UEM · FitoSmart',
};

export const CONTAS_INICIAIS: Conta[] = [
  {
    email: CONTA_ADMIN_SISTEMA.email,
    hash: hashSenha(CONTA_ADMIN_SISTEMA.senha),
    perfil: CONTA_ADMIN_SISTEMA.perfil,
    nome: CONTA_ADMIN_SISTEMA.nome,
    organizacao: CONTA_ADMIN_SISTEMA.organizacao,
  },
];

/** Contas de demonstração antigas — removidas no arranque da base. */
export const EMAILS_DEMO_REMOVER = [
  'agricultor@uem.mz',
  'tecnico@uem.mz',
  'gestor@uem.mz',
  'visualizador@uem.mz',
  'admin.contas@uem.mz',
  'admin.config@uem.mz',
] as const;
