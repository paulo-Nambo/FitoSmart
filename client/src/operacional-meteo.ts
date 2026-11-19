/** Telemetria de pulverização no browser (Open-Meteo + Markov). */
import type {
  CelulaChuva,
  DiaOperacional,
  EstadoHidrico,
  JanelaPulverizacao,
  PainelOperacional,
} from './api';

const LAT = -25.9658;
const LON = 32.5832;
const LOCAL = 'Maputo';
const FUSO = 'Africa/Maputo';
const ESTADOS: EstadoHidrico[] = ['SECO', 'HUMIDO', 'SATURADO', 'CHUVOSO'];

export function calcularDeltaT(tempC: number, humidadePct: number): number {
  const rh = Math.max(1, Math.min(99, humidadePct));
  const t = tempC;
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

function estimarMatriz(sequencia: EstadoHidrico[]) {
  const contagens: Record<EstadoHidrico, Record<EstadoHidrico, number>> = {
    SECO: { SECO: 1, HUMIDO: 1, SATURADO: 1, CHUVOSO: 1 },
    HUMIDO: { SECO: 1, HUMIDO: 1, SATURADO: 1, CHUVOSO: 1 },
    SATURADO: { SECO: 1, HUMIDO: 1, SATURADO: 1, CHUVOSO: 1 },
    CHUVOSO: { SECO: 1, HUMIDO: 1, SATURADO: 1, CHUVOSO: 1 },
  };
  for (let i = 0; i < sequencia.length - 1; i += 1) {
    contagens[sequencia[i]!][sequencia[i + 1]!] += 1;
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

function preverMarkov(
  actual: EstadoHidrico,
  matriz: Record<EstadoHidrico, Record<EstadoHidrico, number>>,
  passos: number,
) {
  const out: Array<{ estado: EstadoHidrico; probabilidade: number }> = [];
  let estado = actual;
  let pAcum = 1;
  for (let k = 0; k < passos; k += 1) {
    let melhor: EstadoHidrico = 'SECO';
    let melhorP = -1;
    for (const c of ESTADOS) {
      if (matriz[estado][c] > melhorP) {
        melhorP = matriz[estado][c];
        melhor = c;
      }
    }
    pAcum *= Math.max(melhorP, 0.01);
    out.push({ estado: melhor, probabilidade: Math.round(pAcum * 1000) / 1000 });
    estado = melhor;
  }
  return out;
}

function truncarSms(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length <= 160 ? limpo : `${limpo.slice(0, 159).trim()}…`;
}

export async function carregarPainelOperacional(sinal?: AbortSignal): Promise<PainelOperacional> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(LAT));
  url.searchParams.set('longitude', String(LON));
  url.searchParams.set('timezone', FUSO);
  url.searchParams.set('past_days', '7');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set(
    'daily',
    'precipitation_sum,soil_moisture_0_to_7cm_mean,surface_pressure_mean,temperature_2m_mean,relative_humidity_2m_mean,wind_speed_10m_max',
  );
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,soil_moisture_0_to_7cm,precipitation',
  );

  const resposta = await fetch(url, { signal });
  if (!resposta.ok) throw new Error('Open-Meteo indisponível');
  const corpo = (await resposta.json()) as {
    daily: {
      time: string[];
      precipitation_sum?: number[];
      soil_moisture_0_to_7cm_mean?: Array<number | null>;
      surface_pressure_mean?: Array<number | null>;
      temperature_2m_mean?: Array<number | null>;
      relative_humidity_2m_mean?: Array<number | null>;
      wind_speed_10m_max?: Array<number | null>;
    };
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      surface_pressure?: number;
      wind_speed_10m?: number;
      soil_moisture_0_to_7cm?: number;
      precipitation?: number;
    };
  };

  const daily = corpo.daily;
  const current = corpo.current ?? {};
  const n = daily.time.length;
  const hojeIso = new Date().toLocaleDateString('en-CA', { timeZone: FUSO });
  const indiceHoje = daily.time.findIndex((d) => d === hojeIso);
  const corte = indiceHoje >= 0 ? indiceHoje : Math.max(0, n - 7);

  const estadosObservados: EstadoHidrico[] = [];
  for (let i = 0; i <= corte; i += 1) {
    estadosObservados.push(
      classificarEstadoHidrico(
        daily.precipitation_sum?.[i] ?? 0,
        daily.soil_moisture_0_to_7cm_mean?.[i] ?? null,
      ),
    );
  }
  const matriz = estimarMatriz(estadosObservados);
  const estadoActual = estadosObservados[estadosObservados.length - 1] ?? 'HUMIDO';
  const previsao = preverMarkov(estadoActual, matriz, Math.max(0, n - corte - 1));

  const temp = current.temperature_2m ?? null;
  const rh = current.relative_humidity_2m ?? null;
  const deltaT = temp !== null && rh !== null ? calcularDeltaT(temp, rh) : null;
  const pressao =
    current.surface_pressure !== undefined ? Math.round(current.surface_pressure * 10) / 10 : null;
  const vento = current.wind_speed_10m ?? null;
  const solo = current.soil_moisture_0_to_7cm ?? null;
  const precipNow = current.precipitation ?? 0;
  const estadoAgora = classificarEstadoHidrico(precipNow, solo);
  const agora = avaliarJanela(estadoAgora, deltaT, precipNow, vento);

  const janelas: DiaOperacional[] = [];
  let idxPrev = 0;
  for (let i = corte; i < n; i += 1) {
    const precip = daily.precipitation_sum?.[i] ?? 0;
    const soloDia = daily.soil_moisture_0_to_7cm_mean?.[i] ?? null;
    const tMedia = daily.temperature_2m_mean?.[i] ?? null;
    const rhMedia = daily.relative_humidity_2m_mean?.[i] ?? null;
    const delta = tMedia !== null && rhMedia !== null ? calcularDeltaT(tMedia, rhMedia) : null;
    const ventoDia = daily.wind_speed_10m_max?.[i] ?? null;
    let estado = classificarEstadoHidrico(precip, soloDia);
    let probabilidadeMarkov = 1;
    if (i > corte && previsao[idxPrev]) {
      probabilidadeMarkov = previsao[idxPrev]!.probabilidade;
      if (precip < 0.2 && soloDia === null) estado = previsao[idxPrev]!.estado;
      idxPrev += 1;
    }
    const { janela, motivo } = avaliarJanela(estado, delta, precip, ventoDia);
    const pressaoDia = daily.surface_pressure_mean?.[i];
    janelas.push({
      dataIso: daily.time[i]!,
      estado,
      precipMm: Math.round(precip * 10) / 10,
      soloM3: soloDia !== null ? Math.round(soloDia * 1000) / 1000 : null,
      pressaoHpa:
        pressaoDia !== undefined && pressaoDia !== null ? Math.round(pressaoDia * 10) / 10 : null,
      deltaT: delta,
      janela,
      motivo,
      probabilidadeMarkov,
    });
  }

  const passo = 0.18;
  const mapaPedidos: Array<Promise<CelulaChuva>> = [];
  for (const dLat of [-passo, 0, passo]) {
    for (const dLon of [-passo, 0, passo]) {
      const la = LAT + dLat;
      const lo = LON + dLon;
      const u = new URL('https://api.open-meteo.com/v1/forecast');
      u.searchParams.set('latitude', String(la));
      u.searchParams.set('longitude', String(lo));
      u.searchParams.set('timezone', FUSO);
      u.searchParams.set('forecast_days', '1');
      u.searchParams.set('daily', 'precipitation_sum');
      mapaPedidos.push(
        fetch(u, { signal })
          .then(async (r) => {
            if (!r.ok) return { lat: la, lon: lo, precipMm: 0 };
            const j = (await r.json()) as { daily?: { precipitation_sum?: number[] } };
            return {
              lat: Math.round(la * 1000) / 1000,
              lon: Math.round(lo * 1000) / 1000,
              precipMm: Math.round((j.daily?.precipitation_sum?.[0] ?? 0) * 10) / 10,
            };
          })
          .catch(() => ({
            lat: Math.round(la * 1000) / 1000,
            lon: Math.round(lo * 1000) / 1000,
            precipMm: 0,
          })),
      );
    }
  }
  const mapaChuva = await Promise.all(mapaPedidos);

  const smsExemplo = truncarSms(
    `FitoSmart ${LOCAL}: pulverizacao ${agora.janela}.${deltaT !== null ? ` DeltaT ${deltaT}C` : ''}${
      pressao !== null ? ` ${pressao}hPa` : ''
    }. Responda AJUDA`,
  );

  return {
    local: LOCAL,
    geradoEm: new Date().toISOString(),
    fonte: 'Open-Meteo (modelos + solo) · Markov com memória agrícola · SMS 2G',
    actual: {
      temperaturaC: temp !== null ? Math.round(temp * 10) / 10 : null,
      humidadePct: rh !== null ? Math.round(rh) : null,
      pressaoHpa: pressao,
      deltaT,
      ventoKmh: vento !== null ? Math.round(vento * 10) / 10 : null,
      soloM3: solo !== null ? Math.round(solo * 1000) / 1000 : null,
      janela: agora.janela,
      motivo: agora.motivo,
    },
    memoriaAgricola: { estadosObservados, matrizTransicao: matriz },
    janelas,
    mapaChuva,
    smsExemplo,
  };
}
