import type { Request, Response } from 'express';
import { emailValido, identificarPedido } from './auth';
import { actualizarPerfil, ContaDuplicada, criarUtilizador, listarUtilizadores } from './base';
import { hashSenha } from './credenciais';
import {
  ePerfil,
  podeGerirContas,
  podeValidar,
  ROTULO_PERFIL,
  type Perfil,
} from './perfis';
import { mensagemSenhaNovaInvalida, senhaNovaValida } from './senha';

function exigirAdminContas(req: Request, res: Response): string | null {
  const identidade = identificarPedido(req);
  if (!identidade?.email) {
    res.status(401).json({ erro: 'Sessão inválida' });
    return null;
  }
  if (!podeGerirContas(identidade.perfil)) {
    res.status(403).json({ erro: 'Acesso negado: Requer perfil ADMIN_SISTEMA ou ADMIN_CONTAS' });
    return null;
  }
  return identidade.email;
}

function exigirAdminSistemaParaPerfil(req: Request, res: Response, perfil: Perfil): boolean {
  if (perfil !== 'ADMIN_SISTEMA') return true;
  const identidade = identificarPedido(req);
  if (identidade?.perfil === 'ADMIN_SISTEMA') return true;
  res.status(403).json({ erro: 'Só o administrador do sistema pode atribuir o perfil Administrador do sistema.' });
  return false;
}

function lerPerfil(valor: unknown): Perfil | null {
  return ePerfil(valor) ? valor : null;
}

function lerNome(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const nome = valor.trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 80) return null;
  return nome;
}

function lerOrganizacao(valor: unknown): string | null | undefined {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') return undefined;
  const texto = valor.trim().replace(/\s+/g, ' ');
  if (texto.length === 0) return null;
  if (texto.length > 80) return undefined;
  return texto;
}

export async function listarUtilizadoresHandler(req: Request, res: Response): Promise<void> {
  if (!exigirAdminContas(req, res)) return;
  try {
    const utilizadores = await listarUtilizadores();
    res.json({ utilizadores });
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
  }
}

export async function criarUtilizadorHandler(req: Request, res: Response): Promise<void> {
  if (!exigirAdminContas(req, res)) return;

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';
  const perfil = lerPerfil(req.body?.perfil);
  const nome = lerNome(req.body?.nome);
  const organizacao = lerOrganizacao(req.body?.organizacao);

  if (!emailValido(email)) {
    res.status(400).json({ erro: 'Indique um email válido, por exemplo nome@uem.mz.' });
    return;
  }
  if (!senhaNovaValida(senha)) {
    res.status(400).json({ erro: mensagemSenhaNovaInvalida(senha) });
    return;
  }
  if (!perfil) {
    res.status(400).json({
      erro: `Escolha um perfil válido (${Object.values(ROTULO_PERFIL).join(', ')}).`,
    });
    return;
  }
  if (!nome) {
    res.status(400).json({ erro: 'Indique o nome da pessoa a quem a conta pertence (2 a 80 caracteres).' });
    return;
  }
  if (organizacao === undefined) {
    res.status(400).json({ erro: 'Organização inválida (máx. 80 caracteres).' });
    return;
  }
  if (!exigirAdminSistemaParaPerfil(req, res, perfil)) return;

  try {
    await criarUtilizador({ email, hash: hashSenha(senha), perfil, nome, organizacao });
  } catch (erro) {
    if (erro instanceof ContaDuplicada) {
      res.status(409).json({ erro: 'Já existe uma conta com este email. Use outro endereço.' });
      return;
    }
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }

  res.status(201).json({ utilizador: { email, perfil, nome, organizacao } });
}

export async function actualizarPerfilHandler(req: Request, res: Response): Promise<void> {
  const autor = exigirAdminContas(req, res);
  if (!autor) return;

  const email = typeof req.params.email === 'string' ? decodeURIComponent(req.params.email).trim().toLowerCase() : '';
  const perfil = lerPerfil(req.body?.perfil);
  if (!emailValido(email) || !perfil) {
    res.status(400).json({ erro: 'Indique um email e um perfil válidos.' });
    return;
  }
  if (email === autor) {
    res.status(409).json({
      erro: 'Não pode alterar o seu próprio perfil nesta sessão. Peça a outro administrador.',
    });
    return;
  }
  if (!exigirAdminSistemaParaPerfil(req, res, perfil)) return;

  try {
    const contas = await listarUtilizadores();
    const alvo = contas.find((conta) => conta.email === email);
    if (!alvo) {
      res.status(404).json({ erro: 'Conta não encontrada.' });
      return;
    }

    if (alvo.perfil === 'ADMIN_SISTEMA' && perfil !== 'ADMIN_SISTEMA') {
      const identidade = identificarPedido(req);
      if (identidade?.perfil !== 'ADMIN_SISTEMA') {
        res.status(403).json({ erro: 'Só o administrador do sistema pode alterar esse perfil.' });
        return;
      }
    }

    if (podeValidar(alvo.perfil) && !podeValidar(perfil)) {
      const validadores = contas.filter((conta) => podeValidar(conta.perfil)).length;
      if (validadores < 2) {
        res.status(409).json({ erro: 'Tem de permanecer pelo menos um técnico ou gestor que possa validar.' });
        return;
      }
    }

    if (podeGerirContas(alvo.perfil) && !podeGerirContas(perfil)) {
      const admins = contas.filter((conta) => podeGerirContas(conta.perfil)).length;
      if (admins < 2) {
        res.status(409).json({ erro: 'Tem de permanecer pelo menos um administrador do sistema ou de contas.' });
        return;
      }
    }

    if (alvo.perfil === 'ADMIN_SISTEMA' && perfil !== 'ADMIN_SISTEMA') {
      const sistemas = contas.filter((conta) => conta.perfil === 'ADMIN_SISTEMA').length;
      if (sistemas < 2) {
        res.status(409).json({ erro: 'Tem de permanecer pelo menos um administrador do sistema.' });
        return;
      }
    }

    const actualizado = await actualizarPerfil(email, perfil);
    if (!actualizado) {
      res.status(404).json({ erro: 'Conta não encontrada.' });
      return;
    }
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }

  const contas = await listarUtilizadores();
  const utilizador = contas.find((item) => item.email === email) ?? {
    email,
    perfil,
    nome: email,
    organizacao: null,
  };
  res.json({ utilizador });
}
