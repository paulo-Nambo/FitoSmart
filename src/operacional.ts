import crypto from 'crypto';
import dns from 'dns';
import type { Request, Response } from 'express';

// Em alguns hosts Windows o Node preferia IPv6 e falhava o connect ao Open-Meteo.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* Node antigo */
}

/** Escape XML para corpo TwiML (Twilio). */
export function escaparXmlSms(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Resposta SMS no formato TwiML que o Twilio espera. */
export function montarTwiml(mensagem: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Response><Message>${escaparXmlSms(mensagem)}</Message></Response>`
  );
}

/** Pedido típico do webhook Twilio (form-urlencoded com Body + Sid). */
export function ehPedidoTwilio(req: Request): boolean {
  const body = req.body ?? {};
  const temBody = typeof body.Body === 'string';
  const temSid =
    typeof body.MessageSid === 'string' ||
    typeof body.SmsSid === 'string' ||
    typeof body.AccountSid === 'string';
  const formato = String(req.query.formato ?? '').toLowerCase();
  if (formato === 'twilio' || formato === 'twiml') return true;
  return temBody && temSid;
}

function urlAssinaturaTwilio(req: Request): string {
  const proto = (req.get('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0].trim();
  return `${proto}://${host}${req.originalUrl}`;
}

/** Valida X-Twilio-Signature quando TWILIO_AUTH_TOKEN está definido. */
export function assinaturaTwilioValida(req: Request, authToken: string): boolean {
  const assinatura = req.get('x-twilio-signature') ?? '';
  if (!assinatura) return false;
  const params = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const base =
    urlAssinaturaTwilio(req) +
    Object.keys(params)
      .sort()
      .map((chave) => `${chave}${params[chave] ?? ''}`)
      .join('');
  const esperado = crypto.createHmac('sha1', authToken).update(base, 'utf8').digest('base64');
  try {
    const a = Buffer.from(assinatura);
    const b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function extrairTextoSms(req: Request): string {
  const body = req.body ?? {};
  if (typeof body.texto === 'string') return body.texto;
  if (typeof body.Body === 'string') return body.Body;
  if (typeof body.text === 'string') return body.text;
  return '';
}

function extrairRemetenteSms(req: Request): string | null {
  const body = req.body ?? {};
  if (typeof body.de === 'string') return body.de;
  if (typeof body.From === 'string') return body.From;
  return null;
}

/** Maputo / UEM — alinhado à previsão do cliente. */
export const LAT_OPERACIONAL = -25.9658;
export const LON_OPERACIONAL = 32.5832;
export const LOCAL_OPERACIONAL = 'Maputo';
const FUSO = 'Africa/Maputo';
const LIMITE_SMS = 160;

/** Estados da cadeia de Markov (memória agrícola = persistência + acumulação hídrica). */
export type EstadoHidrico = 'SECO' | 'HUMIDO' | 'SATURADO' | 'CHUVOSO';

export type JanelaPulverizacao = 'FAVORAVEL' | 'CONDICIONAL' | 'DESFAVORAVEL';

export interface DiaOperacional {
  dataIso: string;
  estado: EstadoHidrico;
  precipMm: number;
  soloM3: number | null;
  pressaoHpa: number | null;
  deltaT: number | null;
  janela: JanelaPulverizacao;
  motivo: string;
  probabilidadeMarkov: number;
}

export interface CelulaChuva {
  lat: number;
  lon: number;
  precipMm: number;
}

export interface PainelOperacional {
  local: string;
  geradoEm: string;
  fonte: string;
  actual: {
    temperaturaC: number | null;
    humidadePct: number | null;
    pressaoHpa: number | null;
    deltaT: number | null;
    ventoKmh: number | null;
    soloM3: number | null;
    janela: JanelaPulverizacao;
    motivo: string;
  };
  memoriaAgricola: {
    estadosObservados: EstadoHidrico[];
    matrizTransicao: Record<EstadoHidrico, Record<EstadoHidrico, number>>;
  };
  janelas: DiaOperacional[];
  mapaChuva: CelulaChuva[];
  smsExemplo: string;
}

const ESTADOS: EstadoHidrico[] = ['SECO', 'HUMIDO', 'SATURADO', 'CHUVOSO'];

interface SerieDiaria {
  time: string[];
  precipitation_sum?: number[];
  soil_moisture_0_to_7cm_mean?: Array<number | null>;
  surface_pressure_mean?: Array<number | null>;
  temperature_2m_mean?: Array<number | null>;
  relative_humidity_2m_mean?: Array<number | null>;
  wind_speed_10m_max?: Array<number | null>;
}

interface SerieActual {
  temperature_2m?: number;
  relative_humidity_2m?: number;
  surface_pressure?: number;
  wind_speed_10m?: number;
  soil_moisture_0_to_7cm?: number;
  precipitation?: number;
}

/**
 * Delta-T ≈ bulbo seco − bulbo húmido (aprox. Stull simplificada).
 * Ideal pulverização típica: 2–8 °C (evitar deriva/evaporação).
 */
export function calcularDeltaT(tempC: number, humidadePct: number): number {
  const rh = Math.max(1, Math.min(99, humidadePct));
  const t = tempC;
  // Aproximação de bulbo húmido (Stull 2011, °C) — adequada a SMS/campo.
  const tw =
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(t + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) -
    4.686035;
  return Math.round((t - tw) * 10) / 10;
}

export function classificarEstadoHidrico(precipMm: number, soloM3: number | null): EstadoHidrico {
  if (precipMm >= 2) return 'CHUVOSO';
  if (soloM3 !== null) {
    if (soloM3 >= 0.35) return 'SATURADO';
    if (soloM3 >= 0.22) return 'HUMIDO';
    return 'SECO';
  }
  if (precipMm >= 0.5) return 'HUMIDO';
  return 'SECO';
}

export function avaliarJanela(
  estado: EstadoHidrico,
  deltaT: number | null,
  precipMm: number,
  ventoKmh: number | null,
): { janela: JanelaPulverizacao; motivo: string } {
  if (estado === 'CHUVOSO' || precipMm >= 1) {
    return { janela: 'DESFAVORAVEL', motivo: 'Chuva ou solo com precipitação activa — risco de lavagem.' };
  }
  if (estado === 'SATURADO') {
    return { janela: 'DESFAVORAVEL', motivo: 'Solo saturado (acumulação hídrica) — evitar pulverização.' };
  }
  if (deltaT !== null && deltaT > 10) {
    return { janela: 'DESFAVORAVEL', motivo: `Delta-T ${deltaT} °C — evaporação elevada do defensivo.` };
  }
  if (deltaT !== null && deltaT < 2) {
    return { janela: 'CONDICIONAL', motivo: `Delta-T ${deltaT} °C — humidade alta; risco de deriva.` };
  }
  if (ventoKmh !== null && ventoKmh > 15) {
    return { janela: 'DESFAVORAVEL', motivo: `Vento ${Math.round(ventoKmh)} km/h — deriva provável.` };
  }
  if (ventoKmh !== null && ventoKmh > 10) {
    return { janela: 'CONDICIONAL', motivo: `Vento ${Math.round(ventoKmh)} km/h — pulverizar com cautela.` };
  }
  if (estado === 'HUMIDO' || (deltaT !== null && (deltaT < 3 || deltaT > 8))) {
    return { janela: 'CONDICIONAL', motivo: 'Condições limítrofes (humidade do solo / Delta-T).' };
  }
  return { janela: 'FAVORAVEL', motivo: 'Janela operacional favorável à pulverização.' };
}

/** Matriz empírica P(j|i) com suavização de Laplace (memória dos dias observados). */
export function estimarMatrizTransicao(
  sequencia: EstadoHidrico[],
): Record<EstadoHidrico, Record<EstadoHidrico, number>> {
  const contagens: Record<EstadoHidrico, Record<EstadoHidrico, number>> = {
    SECO: { SECO: 1, HUMIDO: 1, SATURADO: 1, CHUVOSO: 1 },
    HUMIDO: { SECO: 1, HUMIDO: 1, SATURADO: 1, CHUVOSO: 1 },
    SATURADO: { SECO: 1, HUMIDO: 1, SATURADO: 1, CHUVOSO: 1 },
    CHUVOSO: { SECO: 1, HUMIDO: 1, SATURADO: 1, CHUVOSO: 1 },
  };
  for (let i = 0; i < sequencia.length - 1; i += 1) {
    const de = sequencia[i]!;
    const para = sequencia[i + 1]!;
    contagens[de][para] += 1;
  }
  const matriz = {} as Record<EstadoHidrico, Record<EstadoHidrico, number>>;
  for (const de of ESTADOS) {
    const total = ESTADOS.reduce((s, para) => s + contagens[de][para], 0);
    matriz[de] = {} as Record<EstadoHidrico, number>;
    for (const para of ESTADOS) {
      matriz[de][para] = Math.round((contagens[de][para] / total) * 1000) / 1000;
    }
  }
  return matriz;
}

export function preverEstadosMarkov(
  actual: EstadoHidrico,
  matriz: Record<EstadoHidrico, Record<EstadoHidrico, number>>,
  passos: number,
): Array<{ estado: EstadoHidrico; probabilidade: number }> {
  const resultado: Array<{ estado: EstadoHidrico; probabilidade: number }> = [];
  let estado = actual;
  let pAcum = 1;
  for (let k = 0; k < passos; k += 1) {
    const linha = matriz[estado];
    let melhor: EstadoHidrico = 'SECO';
    let melhorP = -1;
    for (const candidato of ESTADOS) {
      const p = linha[candidato];
      if (p > melhorP) {
        melhorP = p;
        melhor = candidato;
      }
    }
    pAcum *= Math.max(melhorP, 0.01);
    resultado.push({ estado: melhor, probabilidade: Math.round(pAcum * 1000) / 1000 });
    estado = melhor;
  }
  return resultado;
}

function media(valores: Array<number | null | undefined>): number | null {
  const nums = valores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function fetchComRetry(url: string, ms = 25000, tentativas = 3): Promise<globalThis.Response> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(ms) });
      if (resposta.ok) return resposta;
      ultimo = new Error(`HTTP ${resposta.status}`);
    } catch (erro) {
      ultimo = erro;
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw ultimo instanceof Error ? ultimo : new Error('Falha Open-Meteo');
}

async function pedirSerieOpenMeteo(lat: number, lon: number, _sinal?: AbortSignal): Promise<{
  daily: SerieDiaria;
  current: SerieActual;
}> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('timezone', FUSO);
  url.searchParams.set('past_days', '7');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set(
    'daily',
    [
      'precipitation_sum',
      'soil_moisture_0_to_7cm_mean',
      'surface_pressure_mean',
      'temperature_2m_mean',
      'relative_humidity_2m_mean',
      'wind_speed_10m_max',
    ].join(','),
  );
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'surface_pressure',
      'wind_speed_10m',
      'soil_moisture_0_to_7cm',
      'precipitation',
    ].join(','),
  );

  const resposta = await fetchComRetry(url.toString());
  const corpo = (await resposta.json()) as { daily?: SerieDiaria; current?: SerieActual };
  if (!corpo.daily?.time?.length) throw new Error('Open-Meteo sem série diária');
  return { daily: corpo.daily, current: corpo.current ?? {} };
}

async function pedirPrecipitacaoPonto(
  lat: number,
  lon: number,
  _sinal?: AbortSignal,
): Promise<number> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('timezone', FUSO);
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('daily', 'precipitation_sum');
  try {
    const resposta = await fetchComRetry(url.toString(), 15000, 2);
    const corpo = (await resposta.json()) as { daily?: { precipitation_sum?: number[] } };
    return corpo.daily?.precipitation_sum?.[0] ?? 0;
  } catch {
    return 0;
  }
}

/** Grelha 3×3 (~40 km) para mapa de calor regional de chuva. */
export async function mapaCalorChuva(
  lat: number,
  lon: number,
  sinal?: AbortSignal,
): Promise<CelulaChuva[]> {
  const passo = 0.18;
  const offsets = [-passo, 0, passo];
  const pedidos: Array<Promise<CelulaChuva>> = [];
  for (const dLat of offsets) {
    for (const dLon of offsets) {
      const la = lat + dLat;
      const lo = lon + dLon;
      pedidos.push(
        pedirPrecipitacaoPonto(la, lo, sinal).then((precipMm) => ({
          lat: Math.round(la * 1000) / 1000,
          lon: Math.round(lo * 1000) / 1000,
          precipMm: Math.round(precipMm * 10) / 10,
        })),
      );
    }
  }
  return Promise.all(pedidos);
}

export function montarPainel(
  daily: SerieDiaria,
  current: SerieActual,
  mapaChuva: CelulaChuva[],
): PainelOperacional {
  const n = daily.time.length;
  const hojeIso = new Date().toLocaleDateString('en-CA', { timeZone: FUSO });
  const indiceHoje = daily.time.findIndex((d) => d === hojeIso);
  const corte = indiceHoje >= 0 ? indiceHoje : Math.max(0, n - 7);

  const estadosObservados: EstadoHidrico[] = [];
  for (let i = 0; i <= corte; i += 1) {
    const precip = daily.precipitation_sum?.[i] ?? 0;
    const solo = daily.soil_moisture_0_to_7cm_mean?.[i] ?? null;
    estadosObservados.push(classificarEstadoHidrico(precip, solo));
  }

  const matriz = estimarMatrizTransicao(estadosObservados);
  const estadoActual = estadosObservados[estadosObservados.length - 1] ?? 'HUMIDO';
  const previsaoMarkov = preverEstadosMarkov(estadoActual, matriz, Math.max(0, n - corte - 1));

  const tempActual = current.temperature_2m ?? null;
  const rhActual = current.relative_humidity_2m ?? null;
  const deltaActual =
    tempActual !== null && rhActual !== null ? calcularDeltaT(tempActual, rhActual) : null;
  const pressaoActual =
    current.surface_pressure !== undefined
      ? Math.round(current.surface_pressure * 10) / 10
      : null;
  const ventoActual = current.wind_speed_10m ?? null;
  const soloActual = current.soil_moisture_0_to_7cm ?? null;
  const precipActual = current.precipitation ?? 0;
  const estadoAgora = classificarEstadoHidrico(precipActual, soloActual);
  const janelaAgora = avaliarJanela(estadoAgora, deltaActual, precipActual, ventoActual);

  const janelas: DiaOperacional[] = [];
  let idxPrev = 0;
  for (let i = corte; i < n; i += 1) {
    const dataIso = daily.time[i]!;
    const precip = daily.precipitation_sum?.[i] ?? 0;
    const solo = daily.soil_moisture_0_to_7cm_mean?.[i] ?? null;
    const pressao =
      daily.surface_pressure_mean?.[i] !== undefined && daily.surface_pressure_mean[i] !== null
        ? Math.round((daily.surface_pressure_mean[i] as number) * 10) / 10
        : null;
    const tMedia = daily.temperature_2m_mean?.[i] ?? null;
    const rhMedia = daily.relative_humidity_2m_mean?.[i] ?? null;
    const deltaT =
      tMedia !== null && rhMedia !== null ? calcularDeltaT(tMedia, rhMedia) : null;
    const vento = daily.wind_speed_10m_max?.[i] ?? null;

    let estado = classificarEstadoHidrico(precip, solo);
    let probabilidadeMarkov = 1;
    if (i > corte && previsaoMarkov[idxPrev]) {
      // Mistura observação Open-Meteo com persistência Markov (memória agrícola).
      const markov = previsaoMarkov[idxPrev]!;
      probabilidadeMarkov = markov.probabilidade;
      if (precip < 0.2 && solo === null) estado = markov.estado;
      idxPrev += 1;
    }

    const { janela, motivo } = avaliarJanela(estado, deltaT, precip, vento);
    janelas.push({
      dataIso,
      estado,
      precipMm: Math.round(precip * 10) / 10,
      soloM3: solo !== null ? Math.round(solo * 1000) / 1000 : null,
      pressaoHpa: pressao,
      deltaT,
      janela,
      motivo,
      probabilidadeMarkov,
    });
  }

  const smsExemplo = formatarSmsJanela({
    local: LOCAL_OPERACIONAL,
    janela: janelaAgora.janela,
    deltaT: deltaActual,
    pressaoHpa: pressaoActual,
  });

  return {
    local: LOCAL_OPERACIONAL,
    geradoEm: new Date().toISOString(),
    fonte: 'Open-Meteo (modelos + umidade do solo) · Markov com memória agrícola · SMS 2G',
    actual: {
      temperaturaC: tempActual !== null ? Math.round(tempActual * 10) / 10 : null,
      humidadePct: rhActual !== null ? Math.round(rhActual) : null,
      pressaoHpa: pressaoActual,
      deltaT: deltaActual,
      ventoKmh: ventoActual !== null ? Math.round(ventoActual * 10) / 10 : null,
      soloM3: soloActual !== null ? Math.round(soloActual * 1000) / 1000 : null,
      janela: janelaAgora.janela,
      motivo: janelaAgora.motivo,
    },
    memoriaAgricola: {
      estadosObservados,
      matrizTransicao: matriz,
    },
    janelas,
    mapaChuva,
    smsExemplo,
  };
}

export function truncarSms(texto: string, limite = LIMITE_SMS): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (limpo.length <= limite) return limpo;
  return `${limpo.slice(0, limite - 1).trim()}…`;
}

export function formatarSmsJanela(dados: {
  local: string;
  janela: JanelaPulverizacao;
  deltaT: number | null;
  pressaoHpa: number | null;
}): string {
  const dt = dados.deltaT !== null ? ` DeltaT ${dados.deltaT}C` : '';
  const hpa = dados.pressaoHpa !== null ? ` ${dados.pressaoHpa}hPa` : '';
  return truncarSms(`FitoSmart ${dados.local}: pulverizacao ${dados.janela}.${dt}${hpa}. Responda AJUDA`);
}

export function responderSms(comandoBruto: string, painel: PainelOperacional): string {
  const cmd = comandoBruto.trim().toLocaleUpperCase('pt').replace(/\s+/g, ' ');
  if (!cmd || cmd === 'AJUDA' || cmd === 'HELP') {
    return truncarSms('FitoSmart SMS: JANELA | DELTAT | CHUVA | PRESSAO | AJUDA');
  }
  if (cmd.startsWith('JANELA') || cmd === 'PULVERIZAR' || cmd === 'PULVERIZACAO') {
    return formatarSmsJanela({
      local: painel.local,
      janela: painel.actual.janela,
      deltaT: painel.actual.deltaT,
      pressaoHpa: painel.actual.pressaoHpa,
    });
  }
  if (cmd.startsWith('DELTAT') || cmd === 'DELTA-T' || cmd === 'DELTA') {
    const v = painel.actual.deltaT;
    return truncarSms(
      v === null
        ? 'FitoSmart: Delta-T indisponivel agora.'
        : `FitoSmart Delta-T ${v}C (ideal 2-8). Evite >10 (evaporacao) e <2 (deriva).`,
    );
  }
  if (cmd.startsWith('CHUVA') || cmd === 'MAPA') {
    const max = painel.mapaChuva.reduce((m, c) => Math.max(m, c.precipMm), 0);
    const centro = painel.mapaChuva.find(
      (c) => Math.abs(c.lat - LAT_OPERACIONAL) < 0.01 && Math.abs(c.lon - LON_OPERACIONAL) < 0.01,
    );
    return truncarSms(
      `FitoSmart chuva ${painel.local}: centro ${centro?.precipMm ?? '—'}mm; max regional ${max}mm (hoje).`,
    );
  }
  if (cmd.startsWith('PRESSAO') || cmd === 'HPA') {
    const p = painel.actual.pressaoHpa;
    return truncarSms(
      p === null ? 'FitoSmart: pressao indisponivel.' : `FitoSmart pressao ${p} hPa em ${painel.local}.`,
    );
  }
  return truncarSms('FitoSmart: comando desconhecido. Envie AJUDA');
}

let cachePainel: { em: number; painel: PainelOperacional } | null = null;
const CACHE_MS = 15 * 60 * 1000;

export async function obterPainelOperacional(sinal?: AbortSignal): Promise<PainelOperacional> {
  if (cachePainel && Date.now() - cachePainel.em < CACHE_MS) return cachePainel.painel;
  const [{ daily, current }, mapaChuva] = await Promise.all([
    pedirSerieOpenMeteo(LAT_OPERACIONAL, LON_OPERACIONAL, sinal),
    mapaCalorChuva(LAT_OPERACIONAL, LON_OPERACIONAL, sinal),
  ]);
  const painel = montarPainel(daily, current, mapaChuva);
  cachePainel = { em: Date.now(), painel };
  return painel;
}

/** Expõe média auxiliar (testes / diagnóstico). */
export function mediaSerie(valores: Array<number | null | undefined>): number | null {
  return media(valores);
}

export async function operacionalHandler(_req: Request, res: Response): Promise<void> {
  try {
    const painel = await obterPainelOperacional();
    res.status(200).json({ operacional: painel });
  } catch {
    res.status(502).json({ erro: 'Não foi possível obter dados operacionais (Open-Meteo).' });
  }
}

export async function smsHandler(req: Request, res: Response): Promise<void> {
  const twilio = ehPedidoTwilio(req);
  const tokenTwilio = process.env.TWILIO_AUTH_TOKEN?.trim();
  const segredo = process.env.SMS_WEBHOOK_SECRET?.trim();

  if (tokenTwilio && twilio) {
    if (!assinaturaTwilioValida(req, tokenTwilio)) {
      res.status(401).type('text/plain').send('Assinatura Twilio inválida');
      return;
    }
  } else if (segredo) {
    const recebido =
      req.get('x-fitosmart-sms') ??
      (typeof req.query.secret === 'string' ? req.query.secret : '') ??
      '';
    if (recebido !== segredo) {
      if (twilio) {
        res.status(401).type('text/xml').send(montarTwiml('FitoSmart: webhook nao autorizado.'));
      } else {
        res.status(401).json({ erro: 'Webhook SMS não autorizado' });
      }
      return;
    }
  }

  const texto = extrairTextoSms(req);
  if (!texto.trim()) {
    if (twilio) {
      res
        .status(200)
        .type('text/xml')
        .send(montarTwiml('FitoSmart SMS: JANELA | DELTAT | CHUVA | PRESSAO | AJUDA'));
      return;
    }
    res.status(400).json({ erro: 'Envie texto / Body com o comando SMS' });
    return;
  }

  const enviar = (resposta: string, estado: number) => {
    if (twilio) {
      res.status(estado).type('text/xml').send(montarTwiml(resposta));
      return;
    }
    res.status(estado).json({
      resposta,
      caracteres: resposta.length,
      canal: 'SMS_2G',
      de: extrairRemetenteSms(req),
    });
  };

  try {
    const painel = await obterPainelOperacional();
    enviar(responderSms(texto, painel), 200);
  } catch {
    enviar(truncarSms('FitoSmart: dados meteorologicos indisponiveis. Tente mais tarde.'), 502);
  }
}
