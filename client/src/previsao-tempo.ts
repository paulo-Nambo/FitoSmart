/** Open-Meteo (gratuita, sem chave) — Maputo / UEM. */
const LAT = -25.9658;
const LON = 32.5832;
export const LOCAL_PREVISAO = 'Maputo';
const FUSO = 'Africa/Maputo';

export interface DiaPrevisao {
  id: string;
  kind: string;
  title: string;
  description: string;
  meta: string;
  temperatura: number | null;
  maxima: number | null;
  minima: number | null;
  codigo: number;
  dataIso: string;
  chuva: number | null;
  eHoje: boolean;
}

const CODIGOS: Record<number, string> = {
  0: 'Céu limpo',
  1: 'Principalmente limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Nevoeiro',
  48: 'Nevoeiro com geada',
  51: 'Chuvisco fraco',
  53: 'Chuvisco',
  55: 'Chuvisco forte',
  61: 'Chuva fraca',
  63: 'Chuva',
  65: 'Chuva forte',
  71: 'Neve fraca',
  73: 'Neve',
  75: 'Neve forte',
  80: 'Aguaceiros fracos',
  81: 'Aguaceiros',
  82: 'Aguaceiros fortes',
  95: 'Trovoada',
  96: 'Trovoada com granizo',
  99: 'Trovoada forte',
};

export function descricaoCodigo(codigo: number): string {
  return CODIGOS[codigo] ?? CODIGOS[Math.floor(codigo / 10) * 10] ?? 'Condições variáveis';
}

function formatarTemp(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return `${Math.round(valor)}\u00a0°C`;
}

function dataPorExtenso(dataIso?: string): string {
  const base = dataIso ? new Date(`${dataIso}T12:00:00`) : new Date();
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: FUSO,
  }).format(base);
}

function rotuloDiaSemana(dataIso: string, indice: number): string {
  if (indice === 0) return 'Hoje';
  if (indice === 1) return 'Amanhã';
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    timeZone: FUSO,
  }).format(new Date(`${dataIso}T12:00:00`));
}

function dataCurta(dataIso: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: 'numeric',
    month: 'short',
    timeZone: FUSO,
  }).format(new Date(`${dataIso}T12:00:00`));
}

interface RespostaOpenMeteo {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
}

async function pedirPrevisao(dias: number, sinal?: AbortSignal): Promise<RespostaOpenMeteo> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(LAT));
  url.searchParams.set('longitude', String(LON));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
  );
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  );
  url.searchParams.set('timezone', FUSO);
  url.searchParams.set('forecast_days', String(dias));

  const resposta = await fetch(url.toString(), {
    signal: sinal ?? AbortSignal.timeout(10000),
    headers: { Accept: 'application/json' },
  });
  if (!resposta.ok) throw new Error('Não foi possível obter a previsão.');
  return (await resposta.json()) as RespostaOpenMeteo;
}

function montarDia(
  dados: RespostaOpenMeteo,
  indice: number,
  incluirActual: boolean,
): DiaPrevisao | null {
  const dataIso = dados.daily?.time?.[indice];
  if (!dataIso) return null;

  const codigoDia = Number(dados.daily?.weather_code?.[indice] ?? 0);
  const maxima = dados.daily?.temperature_2m_max?.[indice] ?? null;
  const minima = dados.daily?.temperature_2m_min?.[indice] ?? null;
  const chuva = dados.daily?.precipitation_probability_max?.[indice] ?? null;
  const actual = incluirActual && indice === 0 ? dados.current : undefined;
  const tempMostrada = actual?.temperature_2m ?? maxima;
  const humidade = actual?.relative_humidity_2m;
  const vento = actual?.wind_speed_10m;
  const condicao = descricaoCodigo(actual?.weather_code ?? codigoDia);

  const detalhes: string[] = [];
  detalhes.push(`Máx ${formatarTemp(maxima)} · Mín ${formatarTemp(minima)}`);
  if (humidade !== undefined) detalhes.push(`Humidade ${Math.round(humidade)}\u00a0%`);
  if (vento !== undefined) detalhes.push(`Vento ${Math.round(vento)}\u00a0km/h`);
  if (chuva !== null) detalhes.push(`Prob. chuva ${Math.round(chuva)}\u00a0%`);

  return {
    id: `tempo-${dataIso}`,
    kind: rotuloDiaSemana(dataIso, indice),
    title: condicao,
    description: detalhes.join(' · '),
    meta: `${LOCAL_PREVISAO} · ${dataCurta(dataIso)}`,
    temperatura: tempMostrada ?? null,
    maxima,
    minima,
    codigo: actual?.weather_code ?? codigoDia,
    dataIso,
    chuva,
    eHoje: indice === 0,
  };
}

export async function carregarPrevisaoHojeMaputo(sinal?: AbortSignal): Promise<DiaPrevisao> {
  const dados = await pedirPrevisao(1, sinal);
  const dia = montarDia(dados, 0, true);
  if (!dia) throw new Error('Previsão vazia.');
  return {
    ...dia,
    kind: 'Hoje',
    meta: `${LOCAL_PREVISAO} · ${dataPorExtenso(dia.dataIso)} · Open-Meteo`,
  };
}

/** Previsão dos próximos 7 dias (semana) para Maputo. */
export async function carregarPrevisaoSemanaMaputo(sinal?: AbortSignal): Promise<DiaPrevisao[]> {
  const dados = await pedirPrevisao(7, sinal);
  const dias = dados.daily?.time ?? [];
  if (dias.length === 0) throw new Error('Previsão vazia.');

  return dias
    .map((_, indice) => montarDia(dados, indice, true))
    .filter((item): item is DiaPrevisao => item !== null);
}

export const PREVISAO_RESERVA: DiaPrevisao = {
  id: 'tempo-reserva',
  kind: 'Hoje',
  title: 'Tempo indisponível de momento',
  description: 'A previsão de Maputo para hoje volta a carregar quando houver rede.',
  meta: `${LOCAL_PREVISAO} · Open-Meteo`,
  temperatura: null,
  maxima: null,
  minima: null,
  codigo: 0,
  dataIso: '',
  chuva: null,
  eHoje: true,
};
