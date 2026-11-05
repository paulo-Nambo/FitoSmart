import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { identificarPedido } from './auth';
import {
  criarOcorrencia,
  listarOcorrencias,
  marcarValidada,
  obterOcorrencia,
  obterOuCriarParcela,
  reporEstado as reporBase,
  ultimaEncaminhada,
} from './base';
import { existeReferencia, rotuloReferencia } from './biblioteca-referencias';
import { reporImagens } from './imagens';
import type {
  CamposOcorrencia,
  EstadoOcorrencia,
  Ocorrencia,
  ResultadoTriagem,
  Severidade,
} from './tipos';

export function reporEstado(): void {
  reporBase();
  reporImagens();
}

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

function lerSeveridade(valor: unknown): Severidade | null | undefined {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 5) return undefined;
  return numero as Severidade;
}

function lerNomeParcela(valor: unknown): string | null | undefined {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') return undefined;
  const nome = valor.trim();
  if (nome.length === 0) return null;
  if (nome.length > 80) return undefined;
  return nome;
}

function lerReferenciaId(valor: unknown): string | null | undefined {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') return undefined;
  const id = valor.trim();
  if (!id) return null;
  if (!existeReferencia(id)) return undefined;
  return id;
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

  const parcelaNome = lerNomeParcela(req.body?.parcelaNome);
  if (parcelaNome === undefined) {
    res.status(400).json({ erro: 'Nome da parcela inválido (máx. 80 caracteres)' });
    return;
  }

  const severidade = lerSeveridade(req.body?.severidade);
  if (severidade === undefined) {
    res.status(400).json({ erro: 'Severidade inválida (use 1 a 5)' });
    return;
  }

  const referenciaId = lerReferenciaId(req.body?.referenciaId);
  if (referenciaId === undefined) {
    res.status(400).json({ erro: 'Referência de praga/doença inválida' });
    return;
  }

  const triagem = calcularTriagem(sintomas, [...FICHA_BASE]);
  const identidade = identificarPedido(req);

  let parcelaId: string | null = null;
  let parcelaNomeGuardado: string | null = null;
  if (parcelaNome) {
    try {
      const parcela = await obterOuCriarParcela({
        nome: parcelaNome,
        latitude: payload.latitude,
        longitude: payload.longitude,
        autorEmail: identidade?.email ?? null,
      });
      parcelaId = parcela.id;
      parcelaNomeGuardado = parcela.nome;
    } catch {
      res.status(500).json({ erro: 'Erro interno' });
      return;
    }
  }

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
    imagens: [],
    parcelaId,
    parcelaNome: parcelaNomeGuardado,
    referenciaId,
    referenciaRotulo: referenciaId ? rotuloReferencia(referenciaId) : null,
    severidade,
    validadaEm: null,
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
    alvo = { ...alvo, status: 'VALIDADA', validadaEm: new Date().toISOString() };
  }

  res.status(200).json({
    status: 'VALIDADA' as const,
    ocorrencia: alvo,
  });
}
