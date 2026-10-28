import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { Request, Response } from 'express';
import { identificarPedido } from './auth';
import { acrescentarImagem, obterOcorrencia } from './base';

const MAXIMO_BYTES = 2 * 1024 * 1024;
const MAXIMO_POR_OCORRENCIA = 3;
const NOME_FICHEIRO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i;
const ID_OCORRENCIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const imagensMemoria = new Map<string, Buffer>();

export function reporImagens(): void {
  imagensMemoria.clear();
}

function pastaImagens(): string {
  return path.join(process.cwd(), 'dados', 'imagens');
}

function chave(id: string, nome: string): string {
  return `${id}/${nome}`;
}

function eJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

async function podeVer(req: Request, autorEmail: string | null): Promise<boolean> {
  const identidade = identificarPedido(req);
  if (!identidade) return false;
  if (identidade.perfil === 'TECNICO') return true;
  if (!identidade.email) return false;
  return identidade.email === autorEmail;
}

export async function guardarImagemHandler(req: Request, res: Response): Promise<void> {
  const identidade = identificarPedido(req);
  if (!identidade || !identidade.email) {
    res.status(401).json({ erro: 'Sessão inválida' });
    return;
  }

  const id = typeof req.params.id === 'string' ? req.params.id : '';
  if (!ID_OCORRENCIA.test(id)) {
    res.status(400).json({ erro: 'Ocorrência inválida' });
    return;
  }

  const corpo = req.body;
  if (!Buffer.isBuffer(corpo) || corpo.length === 0) {
    res.status(415).json({ erro: 'Envie a fotografia em JPEG.' });
    return;
  }
  if (corpo.length > MAXIMO_BYTES) {
    res.status(413).json({ erro: 'A fotografia é demasiado grande. Use até 2 MB.' });
    return;
  }
  if (!eJpeg(corpo)) {
    res.status(400).json({ erro: 'A fotografia tem de ser um JPEG válido.' });
    return;
  }

  let ocorrencia;
  try {
    ocorrencia = await obterOcorrencia(id);
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }
  if (!ocorrencia) {
    res.status(404).json({ erro: 'Ocorrência não encontrada' });
    return;
  }
  if (identidade.perfil !== 'TECNICO' && identidade.email !== ocorrencia.autorEmail) {
    res.status(403).json({ erro: 'Acesso negado' });
    return;
  }
  if (ocorrencia.imagens.length >= MAXIMO_POR_OCORRENCIA) {
    res.status(409).json({ erro: 'Esta ocorrência já tem o máximo de fotografias.' });
    return;
  }

  const nome = `${randomUUID()}.jpg`;
  try {
    if (process.env.DATABASE_URL) {
      await mkdir(pastaImagens(), { recursive: true });
      await writeFile(path.join(pastaImagens(), nome), corpo);
    } else {
      imagensMemoria.set(chave(id, nome), corpo);
    }
    await acrescentarImagem(id, nome);
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }

  res.status(201).json({ nome });
}

export async function servirImagemHandler(req: Request, res: Response): Promise<void> {
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  const nome = typeof req.params.nome === 'string' ? req.params.nome : '';
  if (!ID_OCORRENCIA.test(id) || !NOME_FICHEIRO.test(nome)) {
    res.status(400).json({ erro: 'Fotografia inválida' });
    return;
  }

  let ocorrencia;
  try {
    ocorrencia = await obterOcorrencia(id);
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }
  if (!ocorrencia || !ocorrencia.imagens.includes(nome)) {
    res.status(404).json({ erro: 'Fotografia não encontrada' });
    return;
  }
  if (!identificarPedido(req)) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }
  if (!(await podeVer(req, ocorrencia.autorEmail))) {
    res.status(403).json({ erro: 'Acesso negado' });
    return;
  }

  try {
    const dados = process.env.DATABASE_URL
      ? await readFile(path.join(pastaImagens(), nome))
      : imagensMemoria.get(chave(id, nome));
    if (!dados) {
      res.status(404).json({ erro: 'Fotografia não encontrada' });
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(dados);
  } catch {
    res.status(404).json({ erro: 'Fotografia não encontrada' });
  }
}
