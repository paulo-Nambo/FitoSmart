import type { Request, Response } from 'express';
import { identificarPedido } from './auth';
import { podeConfigurar } from './perfis';

export interface ConfiguracaoPublica {
  limiarTriagem: number;
}

const LIMIAR_PADRAO = 60;
let limiarTriagem = LIMIAR_PADRAO;

export function obterLimiarTriagem(): number {
  return limiarTriagem;
}

export function obterConfiguracao(): ConfiguracaoPublica {
  return { limiarTriagem };
}

export function reporConfiguracao(): void {
  limiarTriagem = LIMIAR_PADRAO;
}

export function definirLimiarTriagem(valor: number): void {
  limiarTriagem = valor;
}

export async function obterConfiguracaoHandler(req: Request, res: Response): Promise<void> {
  const identidade = identificarPedido(req);
  if (!identidade) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }
  if (!podeConfigurar(identidade.perfil)) {
    res.status(403).json({ erro: 'Acesso negado: Requer perfil ADMIN_SISTEMA ou ADMIN_CONFIG' });
    return;
  }
  res.json({ configuracao: obterConfiguracao() });
}

export async function actualizarConfiguracaoHandler(req: Request, res: Response): Promise<void> {
  const identidade = identificarPedido(req);
  if (!identidade) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }
  if (!podeConfigurar(identidade.perfil)) {
    res.status(403).json({ erro: 'Acesso negado: Requer perfil ADMIN_SISTEMA ou ADMIN_CONFIG' });
    return;
  }

  const bruto = req.body?.limiarTriagem;
  const limiar = typeof bruto === 'number' ? bruto : Number(bruto);
  if (!Number.isInteger(limiar) || limiar < 1 || limiar > 100) {
    res.status(400).json({ erro: 'Indique um limiar de triagem entre 1 e 100.' });
    return;
  }

  definirLimiarTriagem(limiar);
  res.json({ configuracao: obterConfiguracao() });
}
