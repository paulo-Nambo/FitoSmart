import crypto from 'crypto';
import type { Request, Response } from 'express';
import Zavudev from '@zavudev/sdk';
import { obterPainelOperacional, responderSms, truncarSms } from './operacional';

type CanalZavu =
  | 'sms'
  | 'sms_oneway'
  | 'whatsapp'
  | 'telegram'
  | 'email'
  | 'instagram'
  | 'messenger'
  | 'voice';

interface EventoInboundZavu {
  id: string;
  type: string;
  senderId: string;
  data: {
    messageId?: string;
    from?: string;
    channel?: CanalZavu;
    text?: string;
    telegramChatId?: string;
    instagramSenderId?: string;
    messengerSenderId?: string;
  };
}

/** Eventos já processados (anti-retentativa Zavu). */
const eventosVistos = new Set<string>();
const MAX_EVENTOS_CACHE = 500;

/** Verifica X-Zavu-Signature (v2 preferido; fallback v1). */
export function verificarAssinaturaZavu(
  corpoRaw: string,
  header: string | undefined,
  segredo: string,
): boolean {
  if (!header) return false;

  const partes: Record<string, string> = {};
  for (const peca of header.split(',')) {
    const i = peca.indexOf('=');
    if (i > 0) partes[peca.slice(0, i)] = peca.slice(i + 1);
  }

  const t = Number(partes.t);
  if (!Number.isFinite(t)) return false;

  const idade = Math.floor(Date.now() / 1000) - t;
  if (idade > 300 || idade < -60) return false;

  const recebida = partes.v2 ?? partes.v1;
  if (!recebida) return false;

  const assinado = partes.v2 ? `${t}.${corpoRaw}` : corpoRaw;
  const esperada = crypto.createHmac('sha256', segredo).update(assinado).digest('hex');
  if (esperada.length !== recebida.length) return false;
  return crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(recebida));
}

function destinatarioResposta(data: EventoInboundZavu['data']): string | null {
  if (data.channel === 'telegram') return data.telegramChatId ?? null;
  if (data.channel === 'instagram') return data.instagramSenderId ?? null;
  if (data.channel === 'messenger') return data.messengerSenderId ?? null;
  return data.from ?? null;
}

function marcarEventoProcessado(id: string): boolean {
  if (!id) return true;
  if (eventosVistos.has(id)) return false;
  eventosVistos.add(id);
  if (eventosVistos.size > MAX_EVENTOS_CACHE) {
    const primeiro = eventosVistos.values().next().value;
    if (primeiro !== undefined) eventosVistos.delete(primeiro);
  }
  return true;
}

/**
 * Constrói a resposta SMS/WhatsApp a partir do painel operacional (Open-Meteo).
 * Sem texto → AJUDA; falha meteo → mensagem curta de indisponibilidade.
 */
export async function textoRespostaOperacional(comando: string): Promise<string> {
  const pedido = (comando.trim() || 'AJUDA').toUpperCase();
  // AJUDA não precisa de Open-Meteo — evita latência e falhas no help.
  if (pedido === 'AJUDA' || pedido === 'HELP') {
    return truncarSms('FitoSmart SMS: JANELA | DELTAT | CHUVA | PRESSAO | AJUDA');
  }
  try {
    const painel = await obterPainelOperacional();
    return responderSms(pedido, painel);
  } catch {
    return truncarSms('FitoSmart: dados meteorologicos indisponiveis. Tente mais tarde.');
  }
}

async function processarInbound(evento: EventoInboundZavu): Promise<void> {
  if (evento.type !== 'message.inbound') return;
  if (!marcarEventoProcessado(evento.id)) return;

  const { senderId, data } = evento;
  const canal = data.channel;
  const to = destinatarioResposta(data);
  if (!canal || !to || !senderId) return;

  const apiKey = process.env.ZAVUDEV_API_KEY?.trim();
  if (!apiKey) {
    console.error('[zavu] ZAVUDEV_API_KEY em falta — não foi possível responder');
    return;
  }

  const resposta = await textoRespostaOperacional(data.text ?? '');
  const zavu = new Zavudev({ apiKey });

  await zavu.messages.send({
    to,
    channel: canal,
    text: resposta,
    'Zavu-Sender': senderId,
    idempotencyKey: evento.id ? `zavu-reply-${evento.id}` : undefined,
  });
}

/**
 * Webhook Zavu: responde no mesmo canal com dados Open-Meteo (JANELA/DELTAT/…).
 * Requer corpo raw (express.raw) — a assinatura cobre os bytes exactos.
 * Desactive o agent LLM no sender para não haver resposta dupla.
 */
export async function zavuWebhookHandler(req: Request, res: Response): Promise<void> {
  const corpoRaw = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : typeof req.body === 'string'
      ? req.body
      : '';

  const segredo = process.env.ZAVU_WEBHOOK_SECRET?.trim();
  if (segredo) {
    const ok = verificarAssinaturaZavu(
      corpoRaw,
      req.headers['x-zavu-signature'] as string | undefined,
      segredo,
    );
    if (!ok) {
      res.status(401).send('Assinatura Zavu inválida');
      return;
    }
  }

  // Responder já — Zavu retenta se não receber 2xx a tempo.
  res.status(200).send('OK');

  try {
    const evento = JSON.parse(corpoRaw) as EventoInboundZavu;
    await processarInbound(evento);
  } catch (erro) {
    console.error('[zavu] falha ao processar webhook', erro);
  }
}
