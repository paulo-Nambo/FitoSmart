import { scryptSync, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Perfil } from './tipos';

const SAL_DEMO = 'fitosmart-demo';
const ALGORITMO = 'HS256' as const;

interface Utilizador {
  email: string;
  hash: Buffer;
  perfil: Perfil;
}

function hashSenha(senha: string): Buffer {
  return scryptSync(senha, SAL_DEMO, 32);
}

const utilizadores: Utilizador[] = [
  { email: 'agricultor@uem.mz', hash: hashSenha('123456'), perfil: 'AGRICULTOR' },
  { email: 'tecnico@uem.mz', hash: hashSenha('123456'), perfil: 'TECNICO' },
];

const hashInexistente = hashSenha('senha-inexistente');

export function emailValido(email: string): boolean {
  if (typeof email !== 'string') return false;
  const texto = email.trim();
  const arroba = texto.indexOf('@');
  if (arroba <= 0 || arroba !== texto.lastIndexOf('@')) return false;
  const dominio = texto.slice(arroba + 1);
  return dominio.includes('.') && !texto.includes(' ');
}

export function senhaValida(senha: string): boolean {
  return typeof senha === 'string' && senha.length >= 6;
}

function segredoJwt(): string {
  const segredo = process.env.JWT_SECRET;
  if (!segredo || segredo.length < 16) {
    throw new Error('JWT_SECRET em falta ou demasiado curto');
  }
  return segredo;
}

function senhasIguais(senha: string, hash: Buffer): boolean {
  const calculado = hashSenha(senha);
  return timingSafeEqual(calculado, hash);
}

export interface Identidade {
  email: string | null;
  perfil: Perfil;
}

export function identificarPedido(req: Request): Identidade | null {
  const autorizacao = req.headers.authorization;
  if (typeof autorizacao === 'string' && autorizacao.startsWith('Bearer ')) {
    const token = autorizacao.slice('Bearer '.length).trim();
    try {
      const payload = jwt.verify(token, segredoJwt(), { algorithms: [ALGORITMO] });
      if (typeof payload === 'string') return null;
      const perfil = payload.perfil;
      const email = payload.email;
      if ((perfil === 'AGRICULTOR' || perfil === 'TECNICO') && typeof email === 'string') {
        return { perfil, email };
      }
      return null;
    } catch {
      return null;
    }
  }

  const cabecalho = req.headers['x-user-role'];
  const papel = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
  if (papel === 'AGRICULTOR' || papel === 'TECNICO') {
    return { perfil: papel, email: null };
  }
  return null;
}

export function loginHandler(req: Request, res: Response): void {
  const emailBruto = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';

  if (!emailValido(emailBruto) || !senhaValida(senha)) {
    res.status(401).json({ erro: 'Credenciais inválidas' });
    return;
  }

  const utilizador = utilizadores.find((item) => item.email === emailBruto);
  const hash = utilizador ? utilizador.hash : hashInexistente;
  const confere = senhasIguais(senha, hash);

  if (!utilizador || !confere) {
    res.status(401).json({ erro: 'Credenciais inválidas' });
    return;
  }

  const token = jwt.sign(
    { email: utilizador.email, perfil: utilizador.perfil },
    segredoJwt(),
    { algorithm: ALGORITMO, expiresIn: '8h', subject: utilizador.email },
  );

  res.status(200).json({
    token,
    email: utilizador.email,
    perfil: utilizador.perfil,
  });
}
