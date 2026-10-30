import type { NextFunction, Request, Response } from 'express';
import { lerImagemReferencia } from './base';

/** Serve JPEG/PNG/WebP de referência a partir da BD; se falhar, passa ao estático. */
export async function servirReferenciaHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const entradaId = typeof req.params.entradaId === 'string' ? req.params.entradaId : '';
  const nome = typeof req.params.nome === 'string' ? req.params.nome : '';
  if (!entradaId || !nome) {
    next();
    return;
  }

  try {
    const imagem = await lerImagemReferencia(entradaId, nome);
    if (!imagem) {
      next();
      return;
    }
    res.setHeader('Content-Type', imagem.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(imagem.conteudo);
  } catch {
    next();
  }
}
