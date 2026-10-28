import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { identificarPedido } from './auth';
import {
  criarOcorrencia,
  listarOcorrencias,
  marcarValidada,
  obterOcorrencia,
  reporEstado,
  ultimaEncaminhada,
} from './base';
import type { CamposOcorrencia, EstadoOcorrencia, Ocorrencia, ResultadoTriagem } from './tipos';

export { reporEstado };

export const LIMIAR_TRIAGEM = 60;

export const FICHA_BASE = ['manchas_amarelas', 'folhas_secas'] as const;

export const SINTOMAS_PERMITIDOS = [
  'manchas_amarelas',
  'folhas_secas',
  'murcha',
  'pragas_visiveis',
] as const;

const CULTURAS = ['Milho', 'Mandioca', 'Feijão', 'Tomate'] as const;

function numeroFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

export function validarCamposOcorrencia(payload: CamposOcorrencia): string | null {
  if (!numeroFinito(payload.latitude) || payload.latitude < -90 || payload.latitude > 90) {
    return 'Latitude fora dos limites (-90 a 90)';
  }
  if (!numeroFinito(payload.longitude) || payload.longitude < -180 || payload.longitude > 180) {
    return 'Longitude fora dos limites (-180 a 180)';
  }
  return null;
}

export function calcularTriagem(sintomasInput: string[], sintomasFicha: string[]): ResultadoTriagem {
  const entrada = new Set(sintomasInput);
  let coincidencias = 0;
  for (const sintoma of sintomasFicha) {
    if (entrada.has(sintoma)) coincidencias += 1;
  }
  const confianca = sintomasFicha.length === 0 ? 0 : Math.round((coincidencias / sintomasFicha.length) * 100);
  const status: ResultadoTriagem['status'] = confianca >= LIMIAR_TRIAGEM ? 'TRIADA' : 'ENCAMINHADA';
  return { confianca, status };
}

function mensagemDeEstado(status: EstadoOcorrencia): string | undefined {
  if (status === 'ENCAMINHADA') return 'O caso requer revisão humana.';
  return undefined;
}

function lerSintomas(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  const sintomas: string[] = [];
  for (const item of valor) {
    if (typeof item !== 'string' || !SINTOMAS_PERMITIDOS.includes(item as (typeof SINTOMAS_PERMITIDOS)[number])) {
      return null;
    }
    if (!sintomas.includes(item)) sintomas.push(item);
  }
  return sintomas;
}

export async function registrarOcorrenciaHandler(req: Request, res: Response): Promise<void> {
  const sintomas = lerSintomas(req.body?.sintomas);
  if (!sintomas || sintomas.length === 0) {
    res.status(400).json({ erro: 'Deve informar ao menos 1 sintoma' });
    return;
  }

  const cultura = typeof req.body?.cultura === 'string' ? req.body.cultura.trim() : '';
  if (!CULTURAS.includes(cultura as (typeof CULTURAS)[number])) {
    res.status(400).json({ erro: 'Cultura inválida' });
    return;
  }

  const payload: CamposOcorrencia = {
    cultura,
    sintomas,
    latitude: req.body?.latitude,
    longitude: req.body?.longitude,
  };
  const erro = validarCamposOcorrencia(payload);
  if (erro) {
    res.status(400).json({ erro });
    return;
  }

  const triagem = calcularTriagem(sintomas, [...FICHA_BASE]);
  const identidade = identificarPedido(req);
  const ocorrencia: Ocorrencia = {
    id: randomUUID(),
    cultura,
    sintomas,
    latitude: payload.latitude,
    longitude: payload.longitude,
    confianca: triagem.confianca,
    status: triagem.status,
    autorEmail: identidade?.email ?? null,
    criadaEm: new Date().toISOString(),
  };
  try {
    await criarOcorrencia(ocorrencia);
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }

  res.status(201).json({
    ocorrencia,
    confianca: ocorrencia.confianca,
    status: ocorrencia.status,
    mensagem: mensagemDeEstado(ocorrencia.status),
  });
}

export async function listarOcorrenciasHandler(req: Request, res: Response): Promise<void> {
  const identidade = identificarPedido(req);
  if (!identidade) {
    res.status(401).json({ erro: 'Autenticação necessária' });
    return;
  }

  try {
    const visiveis = await listarOcorrencias(identidade.perfil, identidade.email);
    res.status(200).json({ ocorrencias: visiveis });
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
  }
}

export async function validarTecnicoHandler(req: Request, res: Response): Promise<void> {
  const autorizacao = req.headers.authorization;
  if (typeof autorizacao === 'string' && autorizacao.startsWith('Bearer ') && !identificarPedido(req)) {
    res.status(401).json({ erro: 'Token inválido' });
    return;
  }

  const identidade = identificarPedido(req);
  if (!identidade || identidade.perfil !== 'TECNICO') {
    res.status(403).json({ erro: 'Acesso negado: Requer perfil TECNICO' });
    return;
  }

  const id = typeof req.body?.id === 'string' ? req.body.id : undefined;
  let alvo;
  try {
    alvo = id ? await obterOcorrencia(id) : await ultimaEncaminhada();
  } catch {
    res.status(500).json({ erro: 'Erro interno' });
    return;
  }

  if (id && !alvo) {
    res.status(404).json({ erro: 'Ocorrência não encontrada' });
    return;
  }

  if (alvo && alvo.status !== 'ENCAMINHADA') {
    res.status(409).json({ erro: 'Apenas ocorrências encaminhadas podem ser validadas' });
    return;
  }

  if (alvo) {
    try {
      await marcarValidada(alvo.id);
    } catch {
      res.status(500).json({ erro: 'Erro interno' });
      return;
    }
    alvo = { ...alvo, status: 'VALIDADA' };
  }

  res.status(200).json({
    status: 'VALIDADA' as const,
    ocorrencia: alvo,
  });
}
