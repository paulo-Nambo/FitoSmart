import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { actualizarSenha, actualizarTitular, procurarUtilizador } from './base';
import { HASH_INEXISTENTE, hashSenha, senhasIguais } from './credenciais';
import { ePerfil, type Perfil } from './perfis';
import { mensagemSenhaNovaInvalida, senhaNovaValida, senhaValida } from './senha';

export { senhaValida } from './senha';

function lerNomeTitular(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const nome = valor.trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 80) return null;
  return nome;
}

function lerOrganizacaoTitular(valor: unknown): string | null | undefined {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') return undefined;
  const texto = valor.trim().replace(/\s+/g, ' ');
  if (texto.length === 0) return null;
  if (texto.length > 80) return undefined;
  return texto;
}

const ALGORITMO = 'HS256' as const;

export function emailValido(email: string): boolean {
  if (typeof email !== 'string') return false;
  const texto = email.trim();
  const arroba = texto.indexOf('@');
  if (arroba <= 0 || arroba !== texto.lastIndexOf('@')) return false;
  const dominio = texto.slice(arroba + 1);
  return dominio.includes('.') && !texto.includes(' ');
}

function segredoJwt(): string {
  const segredo = process.env.JWT_SECRET;
  if (!segredo || segredo.length < 16) {
    throw new Error('JWT_SECRET em falta ou demasiado curto');
  }
  return segredo;
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
      if (ePerfil(perfil) && typeof email === 'string') {
        return { perfil, email };
      }
      return null;
    } catch {
      return null;
    }
  }

  const cabecalho = req.headers['x-user-role'];
  const papel = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
  if (ePerfil(papel)) {
    return { perfil: papel, email: null };
  }
  return null;
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const emailBruto = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';

  if (!emailValido(emailBruto) || !senhaValida(senha)) {
    res.status(401).json({ erro: 'Credenciais inválidas' });
    return;
  }

  let utilizador;
  try {
    utilizador = await procurarUtilizador(emailBruto);
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }
  const hash = utilizador ? utilizador.hash : HASH_INEXISTENTE;
  const confere = senhasIguais(senha, hash);

  if (!utilizador || !confere) {
    res.status(401).json({ erro: 'Credenciais inválidas' });
    return;
  }

  const token = jwt.sign(
    { email: utilizador.email, perfil: utilizador.perfil, nome: utilizador.nome },
    segredoJwt(),
    { algorithm: ALGORITMO, expiresIn: '8h', subject: utilizador.email },
  );

  res.status(200).json({
    token,
    email: utilizador.email,
    perfil: utilizador.perfil,
    nome: utilizador.nome,
    organizacao: utilizador.organizacao,
  });
}

/** Alterar senha com a senha actual (não revela se o email existe). */
export async function alterarSenhaHandler(req: Request, res: Response): Promise<void> {
  const identidade = identificarPedido(req);
  const emailCorpo = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const email = identidade?.email ?? emailCorpo;
  const senhaActual = typeof req.body?.senhaActual === 'string' ? req.body.senhaActual : '';
  const senhaNova = typeof req.body?.senhaNova === 'string' ? req.body.senhaNova : '';

  if (identidade?.email && emailCorpo && emailCorpo !== identidade.email) {
    res.status(403).json({ erro: 'Só pode alterar a senha da sua própria conta.' });
    return;
  }

  if (!emailValido(email) || !senhaValida(senhaActual)) {
    res.status(401).json({ erro: 'Credenciais inválidas' });
    return;
  }
  if (!senhaNovaValida(senhaNova)) {
    res.status(400).json({ erro: mensagemSenhaNovaInvalida(senhaNova) });
    return;
  }
  if (senhaNova === senhaActual) {
    res.status(400).json({ erro: 'A nova senha tem de ser diferente da senha actual.' });
    return;
  }

  let utilizador;
  try {
    utilizador = await procurarUtilizador(email);
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }

  const hash = utilizador ? utilizador.hash : HASH_INEXISTENTE;
  const confere = senhasIguais(senhaActual, hash);
  if (!utilizador || !confere) {
    res.status(401).json({ erro: 'Credenciais inválidas' });
    return;
  }

  try {
    const actualizado = await actualizarSenha(utilizador.email, hashSenha(senhaNova));
    if (!actualizado) {
      res.status(500).json({ erro: 'Erro interno' });
      return;
    }
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }

  res.status(200).json({ ok: true, mensagem: 'Senha actualizada. Pode entrar com a nova senha.' });
}

/** Actualiza titular e organização da conta autenticada. */
export async function actualizarContaHandler(req: Request, res: Response): Promise<void> {
  const identidade = identificarPedido(req);
  if (!identidade?.email) {
    res.status(401).json({ erro: 'Sessão inválida' });
    return;
  }

  const nome = lerNomeTitular(req.body?.nome);
  const organizacao = lerOrganizacaoTitular(req.body?.organizacao);
  if (!nome) {
    res.status(400).json({ erro: 'Indique o seu nome completo (2 a 80 caracteres).' });
    return;
  }
  if (organizacao === undefined) {
    res.status(400).json({ erro: 'Organização inválida (máx. 80 caracteres).' });
    return;
  }

  try {
    const actualizado = await actualizarTitular(identidade.email, { nome, organizacao });
    if (!actualizado) {
      res.status(404).json({ erro: 'Conta não encontrada.' });
      return;
    }
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }

  res.status(200).json({
    ok: true,
    mensagem: 'Perfil actualizado.',
    utilizador: {
      email: identidade.email,
      perfil: identidade.perfil,
      nome,
      organizacao,
    },
  });
}
