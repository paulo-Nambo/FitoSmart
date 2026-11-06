import type { Request, Response } from 'express';
import jpeg from 'jpeg-js';
import { identificarPedido } from './auth';
import { resolverEntradaReferencia, type OpcoesReferencia } from './biblioteca-referencias';

const SINTOMAS_VALIDOS = new Set(['manchas_amarelas', 'folhas_secas', 'murcha', 'pragas_visiveis']);
const CULTURAS = new Set(['Milho', 'Mandioca', 'Feijão', 'Tomate']);

export interface Diagnostico {
  praga: string;
  nomeCientifico: string | null;
  culturaDetectada: string | null;
  sintomas: string[];
  confianca: number;
  recomendacao: string;
  motor: 'openepi' | 'ollama' | 'gemini' | 'fitosmart';
  resumo: string;
  imagensReferencia: string[];
  referenciaId: string | null;
  /** True quando a praga é estimativa (visão indecisa ou fallback local). */
  hipotese: boolean;
  /** Outras causas plausíveis a comparar no talhão. */
  alternativas: string[];
}

function anexarReferencia(opcoes: OpcoesReferencia): Pick<Diagnostico, 'imagensReferencia' | 'referenciaId'> {
  const entrada = resolverEntradaReferencia(opcoes);
  const limite = opcoes.limite ?? 4;
  return {
    imagensReferencia: entrada?.imagens.slice(0, limite) ?? [],
    referenciaId: entrada?.id ?? null,
  };
}

interface SinaisVisuais {
  amarelas: number;
  secas: number;
  /** Tecido necrótico acinzentado / lesão (baixa saturação). */
  necrose: number;
  murchas: number;
  contrastes: number;
  verde: number;
}

function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function extrairSinais(buffer: Buffer): SinaisVisuais {
  const imagem = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 64 });
  const { width, height, data } = imagem;
  const passoX = Math.max(1, Math.floor(width / 96));
  const passoY = Math.max(1, Math.floor(height / 96));
  let total = 0;
  let amarelas = 0;
  let secas = 0;
  let necrose = 0;
  let murchas = 0;
  let contrastes = 0;
  let verde = 0;

  for (let y = 0; y < height; y += passoY) {
    for (let x = 0; x < width; x += passoX) {
      const i = (y * width + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const { h, s, l } = hsv(r, g, b);
      total += 1;
      if (h >= 40 && h <= 72 && s > 0.32 && l > 0.28 && l < 0.82) amarelas += 1;
      else if (h >= 14 && h < 40 && s > 0.22 && l > 0.12 && l < 0.48) secas += 1;
      // Lesão necrótica acinzentada / castanha (comum na queima foliar).
      else if (l > 0.22 && l < 0.62 && s < 0.3 && (h < 70 || h > 200)) necrose += 1;
      else if (l < 0.2 && s < 0.38) murchas += 1;
      else if (h >= 72 && h <= 160 && s > 0.25 && l > 0.18 && l < 0.7) verde += 1;

      const j = i + 16;
      if (j + 2 < data.length) {
        const dr = Math.abs(data[i] - data[j]);
        const dg = Math.abs(data[i + 1] - data[j + 1]);
        const db = Math.abs(data[i + 2] - data[j + 2]);
        if (dr + dg + db > 140) contrastes += 1;
      }
    }
  }

  if (total === 0) return { amarelas: 0, secas: 0, necrose: 0, murchas: 0, contrastes: 0, verde: 0 };
  return {
    amarelas: amarelas / total,
    secas: secas / total,
    necrose: necrose / total,
    murchas: murchas / total,
    contrastes: contrastes / total,
    verde: verde / total,
  };
}

function sintomasVisuais(sinais: SinaisVisuais): string[] {
  const sintomas: string[] = [];
  if (sinais.amarelas >= 0.04) sintomas.push('manchas_amarelas');
  // Necrose alongada conta como tecido seco/morto (queima foliar, etc.).
  if (sinais.secas >= 0.03 || sinais.necrose >= 0.04) sintomas.push('folhas_secas');
  if (sinais.murchas >= 0.12) sintomas.push('murcha');
  if (sinais.contrastes >= 0.15 && !sintomas.includes('manchas_amarelas') && sinais.necrose < 0.05) {
    sintomas.push('pragas_visiveis');
  }
  return sintomas;
}

interface HipoteseSintomas {
  praga: string;
  nomeCientifico: string | null;
  recomendacao: string;
  alternativas: string[];
}

function hipotesePorSintomas(cultura: string | null, sintomas: string[]): HipoteseSintomas | null {
  if (!cultura || sintomas.length === 0) return null;
  const tem = (id: string) => sintomas.includes(id);
  if (cultura === 'Milho') {
    if (tem('pragas_visiveis')) {
      return {
        praga: 'Lagarta-do-cartucho (hipótese)',
        nomeCientifico: 'Spodoptera frugiperda',
        recomendacao: 'Inspeccione o cartucho. Confirme larvas antes de tratar.',
        alternativas: [],
      };
    }
    if (tem('folhas_secas') || tem('murcha') || (tem('manchas_amarelas') && tem('folhas_secas'))) {
      return {
        praga: 'Queima foliar do milho (hipótese)',
        nomeCientifico: 'Exserohilum turcicum',
        recomendacao:
          'Lesão alongada acinzentada/castanha na folha é típica de queima foliar. Confirme no talhão antes de tratar.',
        alternativas: ['Vírus do riscado do milho (Maize streak virus)'],
      };
    }
    if (tem('manchas_amarelas')) {
      return {
        praga: 'Queima foliar do milho (hipótese)',
        nomeCientifico: 'Exserohilum turcicum',
        recomendacao:
          'Com só clorose amarela, compare também o vírus do riscado (riscas paralelas às nervuras). Lesões em forma de charuto apontam para queima foliar.',
        alternativas: ['Vírus do riscado do milho (Maize streak virus)'],
      };
    }
  }
  if (cultura === 'Mandioca' && tem('manchas_amarelas')) {
    return {
      praga: 'Mosaico da mandioca (hipótese)',
      nomeCientifico: 'Cassava mosaic virus',
      recomendacao: 'Use material de plantio limpo; elimine plantas muito afectadas.',
      alternativas: ['Estría castanha da mandioca (CBSD)'],
    };
  }
  if (cultura === 'Feijão' && tem('manchas_amarelas')) {
    return {
      praga: 'Ferrugem / mancha foliar (hipótese)',
      nomeCientifico: null,
      recomendacao: 'Compare com as referências de ferrugem e mancha angular.',
      alternativas: ['Ferrugem do feijão', 'Mancha angular do feijão'],
    };
  }
  if (cultura === 'Tomate') {
    if (tem('pragas_visiveis')) {
      return {
        praga: 'Traça-do-tomateiro (hipótese)',
        nomeCientifico: 'Tuta absoluta',
        recomendacao: 'Procure minas nas folhas; confirme antes de tratar.',
        alternativas: [],
      };
    }
    if (tem('manchas_amarelas') || tem('folhas_secas')) {
      return {
        praga: 'Alternária / míldio (hipótese)',
        nomeCientifico: null,
        recomendacao: 'Remova folhas baixas afectadas e melhore o arejamento.',
        alternativas: ['Alternária / pinta-preta', 'Míldio do tomateiro'],
      };
    }
  }
  return null;
}

export function diagnosticarLocal(buffer: Buffer, culturaPreferida?: string): Diagnostico {
  const sinais = extrairSinais(buffer);
  const visiveis = sintomasVisuais(sinais);
  const cultura =
    culturaPreferida && CULTURAS.has(culturaPreferida) ? culturaPreferida : null;

  if (visiveis.length === 0) {
    return {
      praga: 'Padrão pouco claro',
      nomeCientifico: null,
      culturaDetectada: cultura,
      sintomas: [],
      confianca: 0,
      recomendacao: 'Carregue outra fotografia mais próxima da folha afectada.',
      motor: 'fitosmart',
      resumo: 'A fotografia não mostrou um padrão claro para diagnóstico.',
      imagensReferencia: [],
      referenciaId: null,
      hipotese: true,
      alternativas: [],
    };
  }

  const dominanteFoliar =
    sinais.amarelas + sinais.secas + sinais.necrose >= sinais.contrastes || sinais.necrose >= 0.04;
  const sintomas = dominanteFoliar
    ? visiveis.filter((id) => id !== 'pragas_visiveis')
    : visiveis;
  const lista = sintomas.length > 0 ? sintomas : visiveis;
  const hipotese = hipotesePorSintomas(cultura, lista);
  const praga = hipotese?.praga ?? 'Sintomas detectados na fotografia';
  const nomeCientifico = hipotese?.nomeCientifico ?? null;
  const pragaRef = hipotese
    ? hipotese.praga.replace(/\s*\(hipótese\)\s*/i, '').replace(/\s*\(por confirmar\)\s*/i, '').trim()
    : null;

  return {
    praga,
    nomeCientifico,
    culturaDetectada: cultura,
    sintomas: lista,
    confianca: Math.min(52, 32 + lista.length * 6 + (sinais.necrose >= 0.04 ? 8 : 0)),
    recomendacao:
      hipotese?.recomendacao ??
      'A IA de visão não respondeu a tempo. Os sintomas são por análise de cor — confirme no talhão.',
    motor: 'fitosmart',
    resumo: hipotese
      ? `Hipótese local por sintomas${cultura ? ` em ${cultura}` : ''}: ${hipotese.praga}.`
      : `Estimativa local: ${lista.length} sintoma(s)${cultura ? ` em ${cultura}` : ''}.`,
    hipotese: true,
    alternativas: hipotese?.alternativas ?? [],
    ...anexarReferencia({
      praga: pragaRef,
      nomeCientifico,
      cultura,
      limite: 3,
    }),
  };
}

function reduzirJpegParaVisao(buffer: Buffer, maxLado = 896): Buffer {
  try {
    // JPEG já compacto o suficiente: não re-encodar (jpeg-js a 72 destroí a lesão).
    if (buffer.length > 0 && buffer.length <= 550_000) {
      const imagem = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 64 });
      if (Math.max(imagem.width, imagem.height) <= maxLado) return buffer;
    }
    const imagem = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 64 });
    const escala = Math.min(1, maxLado / Math.max(imagem.width, imagem.height));
    if (escala >= 0.98 && buffer.length <= 700_000) return buffer;
    const largura = Math.max(1, Math.round(imagem.width * escala));
    const altura = Math.max(1, Math.round(imagem.height * escala));
    const data = Buffer.alloc(largura * altura * 4);
    for (let y = 0; y < altura; y += 1) {
      const sy = Math.min(imagem.height - 1, Math.floor(y / escala));
      for (let x = 0; x < largura; x += 1) {
        const sx = Math.min(imagem.width - 1, Math.floor(x / escala));
        const si = (sy * imagem.width + sx) * 4;
        const di = (y * largura + x) * 4;
        data[di] = imagem.data[si];
        data[di + 1] = imagem.data[si + 1];
        data[di + 2] = imagem.data[si + 2];
        data[di + 3] = 255;
      }
    }
    return Buffer.from(jpeg.encode({ data, width: largura, height: altura }, 85).data);
  } catch {
    return buffer;
  }
}

function limparSintomas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.map(String).filter((id) => SINTOMAS_VALIDOS.has(id)))];
}

function hostOllama(): string {
  return (process.env.OLLAMA_HOST?.trim() || 'http://127.0.0.1:11434').replace(/\/$/, '');
}

function eModeloVisao(nome: string): boolean {
  return /llava|vision|vl\b|moondream|minicpm|bakllava|gemma3|llama3\.2-vision/i.test(nome);
}

async function listarModelosOllama(): Promise<string[]> {
  try {
    const resposta = await fetch(`${hostOllama()}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!resposta.ok) return [];
    const corpo = (await resposta.json()) as { models?: Array<{ name?: string }> };
    return (corpo.models ?? []).map((item) => item.name).filter((nome): nome is string => Boolean(nome));
  } catch {
    return [];
  }
}

function resolverModeloOllama(configurado: string | undefined, modelos: string[]): string | null {
  if (modelos.length === 0) return null;
  if (configurado) {
    const exacto = modelos.find((nome) => nome === configurado);
    if (exacto) return exacto;
    const prefixo = modelos.find((nome) => nome === `${configurado}:latest` || nome.startsWith(`${configurado}:`));
    if (prefixo) return prefixo;
  }
  return modelos.find(eModeloVisao) ?? modelos[0] ?? null;
}

async function escolherModeloOllama(): Promise<{ modelo: string; visao: boolean } | null> {
  const modelos = await listarModelosOllama();
  const configurado = process.env.OLLAMA_MODEL?.trim();
  const candidato = resolverModeloOllama(configurado, modelos);
  // Só modelos com visão — texto puro (ex. qwen3) não analisa a fotografia.
  if (candidato && eModeloVisao(candidato)) return { modelo: candidato, visao: true };
  const visao = modelos.find(eModeloVisao);
  if (visao) return { modelo: visao, visao: true };
  return null;
}

function percentual(valor: number) {
  return `${Math.round(valor * 100)}%`;
}

function exemplosCultura(cultura: string): string {
  if (cultura === 'Milho') return 'Queima foliar do milho | Vírus do riscado do milho | Ferrugem do milho | Lagarta-do-cartucho';
  if (cultura === 'Mandioca') return 'Mosaico da mandioca | Estria castanha da mandioca';
  if (cultura === 'Feijão') return 'Ferrugem do feijão | Mancha angular do feijão';
  if (cultura === 'Tomate') return 'Alternária / pinta-preta | Míldio do tomateiro | Traça-do-tomateiro';
  return 'nome da doença';
}

/** 1.ª passagem: obrigar o LLaVA a descrever o que VÊ (sem nome de doença). */
function promptDescricaoVisao(culturaPreferida?: string): string {
  const cultura = culturaPreferida && CULTURAS.has(culturaPreferida) ? culturaPreferida : 'crop';
  return `LOOK at the ${cultura} leaf photo. Describe ONLY what is visible: lesion shape (cigar/elongated vs thin stripes vs holes), colours (grey-brown necrotic vs bright yellow), and where on the leaf. 2 short sentences. No disease name.`;
}

/** Prompt só de visão — sem percentagens de cor (enviesam o LLaVA a ignorar a foto). */
function promptVisao(culturaPreferida?: string, descricao?: string): string {
  const cultura = culturaPreferida && CULTURAS.has(culturaPreferida) ? culturaPreferida : 'desconhecida';
  const visto = descricao?.trim()
    ? `Visual notes from the same photo: ${descricao.trim().slice(0, 280)}\n`
    : '';
  return `You are a plant pathologist. You MUST use the leaf photograph (and the visual notes).
Crop: ${cultura}.
${visto}Name the most likely SPECIFIC disease (max 6 words). Forbidden: "Praga do milho", "Doença", "Clorose", crop name alone.
Maize: elongated grey-brown cigar lesion = Queima foliar do milho; thin yellow streaks along veins = Vírus do riscado do milho; chewed holes = Lagarta-do-cartucho.
Examples: ${exemplosCultura(cultura)}.
JSON only (key confianca without accent):
{"praga":"...","nomeCientifico":null,"sintomas":["manchas_amarelas","folhas_secas"],"confianca":50-85,"recomendacao":"...","resumo":"lesion seen in the photo"}`;
}

function promptVisaoCurto(culturaPreferida?: string): string {
  const cultura = culturaPreferida && CULTURAS.has(culturaPreferida) ? culturaPreferida : 'desconhecida';
  return `Look carefully at this ${cultura} leaf IMAGE. Name the disease from the lesion shape you see.
Long grey/brown dead streak (cigar) → Queima foliar do milho.
Thin yellow streaks on veins → Vírus do riscado do milho.
Chewed holes → Lagarta-do-cartucho.
JSON only: {"praga":"...","nomeCientifico":null,"sintomas":["manchas_amarelas","folhas_secas"],"confianca":60,"resumo":"describe the lesion colours and shape","recomendacao":"confirm in the field"}`;
}

/** Traduz nomes ingleses / sinónimos que o LLaVA devolve com frequência. */
function normalizarPragaConhecida(praga: string): { praga: string; nomeCientifico: string | null } | null {
  const n = normalizarTexto(praga);
  const mapa: Array<{ match: RegExp; praga: string; ciencia: string | null }> = [
    {
      match: /northern\s+(corn\s+)?leaf\s+blight|\bnclb\b|queima\s+foliar|helminthosporium\s+turcicum|exserohilum\s+turcicum|setosphaeria\s+turcica/,
      praga: 'Queima foliar do milho',
      ciencia: 'Exserohilum turcicum',
    },
    {
      match: /maize\s+streak|\bmsv\b|riscado\s+do\s+milho|virus\s+do\s+riscado/,
      praga: 'Vírus do riscado do milho',
      ciencia: 'Maize streak virus',
    },
    {
      match: /common\s+rust|ferrugem\s+do\s+milho|puccinia\s+sorghi/,
      praga: 'Ferrugem do milho',
      ciencia: 'Puccinia sorghi',
    },
    {
      match: /fall\s+armyworm|lagarta[\s-]?do[\s-]?cartucho|spodoptera/,
      praga: 'Lagarta-do-cartucho',
      ciencia: 'Spodoptera frugiperda',
    },
    {
      match: /cassava\s+mosaic|mosaico\s+da\s+mandioca/,
      praga: 'Mosaico da mandioca',
      ciencia: 'Cassava mosaic virus',
    },
    {
      match: /early\s+blight|alternaria|pinta[\s-]?preta/,
      praga: 'Alternária / pinta-preta',
      ciencia: 'Alternaria solani',
    },
    {
      match: /late\s+blight|mildio|phytophthora/,
      praga: 'Míldio do tomateiro',
      ciencia: 'Phytophthora infestans',
    },
  ];
  for (const item of mapa) {
    if (item.match.test(n) || item.match.test(praga)) {
      return { praga: item.praga, nomeCientifico: item.ciencia };
    }
  }
  return null;
}

function promptDiagnostico(sinais?: SinaisVisuais, sintomas?: string[], culturaPreferida?: string) {
  const cultura = culturaPreferida && CULTURAS.has(culturaPreferida) ? culturaPreferida : 'desconhecida';
  const sinaisLinha =
    sinais && sintomas
      ? `Optional colour hints (do NOT invent a disease only from these): yellow ${percentual(sinais.amarelas)}, dry ${percentual(sinais.secas)}, necrosis ${percentual(sinais.necrose)}.`
      : '';
  return `Plant pathologist. Crop: ${cultura}. Study the photo.
${sinaisLinha}
"praga" = specific disease name. Forbidden generic names. Examples: ${exemplosCultura(cultura)}.
JSON (confianca without accent):
{"praga":"...","nomeCientifico":null,"sintomas":["manchas_amarelas","folhas_secas"],"confianca":0-100,"recomendacao":"...","resumo":"..."}`;
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Nomes genéricos que o LLaVA inventa em vez de uma doença concreta. */
function nomePragaInutil(praga: string): boolean {
  const n = normalizarTexto(praga);
  if (/^clorose\b/.test(n) || /\bclorose\s+(em|do|da)\b/.test(n)) return true;
  if (!n || n === 'indeterminado' || n === 'desconhecido' || n === 'none' || n === 'n a') return true;
  if (/^(milho|mandioca|feijao|tomate|planta|folha|cultura|saudavel|healthy)$/.test(n)) return true;
  if (/^(praga|doenca|pest|disease|fungo|virose|virus|problema|sintoma)s?\b/.test(n)) {
    if (n.split(' ').length <= 4) return true;
  }
  if (/\b(praga|doenca)\s+d[oa]\s+(milho|mandioca|feijao|tomate|planta)\b/.test(n)) return true;
  return false;
}

const CIENTIFICO_PARA_PRAGA: Array<{ match: RegExp; praga: string; foliar?: boolean }> = [
  { match: /exserohilum\s+turcicum|setosphaeria\s+turcica/i, praga: 'Queima foliar do milho', foliar: true },
  { match: /puccinia\s+sorghi/i, praga: 'Ferrugem do milho', foliar: true },
  { match: /spodoptera\s+frugiperda/i, praga: 'Lagarta-do-cartucho' },
  { match: /maize\s+streak|msv\b/i, praga: 'Vírus do riscado do milho', foliar: true },
  { match: /fusarium\s+(verticillioides|moniliforme|fujikuroi)/i, praga: 'Podridão por Fusarium' },
  { match: /alternaria\s+solani/i, praga: 'Alternária / pinta-preta', foliar: true },
  { match: /phytophthora\s+infestans/i, praga: 'Míldio do tomateiro', foliar: true },
  { match: /tuta\s+absoluta/i, praga: 'Traça-do-tomateiro' },
  { match: /cassava\s+mosaic|cmd\b/i, praga: 'Mosaico da mandioca', foliar: true },
  { match: /uromyces\s+appendiculatus/i, praga: 'Ferrugem do feijão', foliar: true },
];

function pragaPorNomeCientifico(nome: string | null): string | null {
  if (!nome?.trim()) return null;
  for (const item of CIENTIFICO_PARA_PRAGA) {
    if (item.match.test(nome)) return item.praga;
  }
  return null;
}

function patogenoPoucaFoliar(nomeCientifico: string | null): boolean {
  if (!nomeCientifico) return false;
  return /fusarium\s+(verticillioides|moniliforme|fujikuroi)/i.test(nomeCientifico);
}

function limparNomePraga(bruto: string, recomendacao: string, resumo: string): {
  praga: string;
  recomendacao: string;
  resumo: string;
} {
  const texto = bruto.trim();
  const pareceDesculpa =
    /desfoc|borrad|baixa qualidade|não foi possível|nao foi possivel|pouco nítid|pouco nitid|ilegív|ilegiv|blur|out of focus/i.test(
      texto,
    );
  const demasiadoLongo = texto.length > 60 || texto.split(/\s+/).length > 8;
  if (!pareceDesculpa && !demasiadoLongo) {
    return { praga: texto, recomendacao, resumo };
  }
  const extra = texto.slice(0, 220);
  return {
    praga: 'Indeterminado',
    recomendacao: recomendacao || 'Confirme no talhão; tire outra foto da folha afectada de perto.',
    resumo: resumo && !/qualidade|desfoc/i.test(resumo) ? resumo : extra,
  };
}

function extrairCamposSoltos(texto: string): Record<string, unknown> | null {
  const praga = texto.match(/"praga"\s*:\s*"([^"]{2,80})"/i)?.[1]?.trim();
  if (!praga) return null;
  const confiancaMatch = texto.match(/"confian[cç]a"\s*:\s*(\d{1,3})/i);
  const sintomasBloco = texto.match(/"sintomas"\s*:\s*\[([^\]]*)\]/i)?.[1] ?? '';
  const sintomas = [...sintomasBloco.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const cientifico = texto.match(/"nomeCientifico"\s*:\s*(?:"([^"]*)"|null)/i);
  const recomendacao = texto.match(/"recomendac[aã]o"\s*:\s*"([^"]{2,180})/i)?.[1];
  const resumo = texto.match(/"resumo"\s*:\s*"([^"]{2,180})/i)?.[1];
  return {
    praga,
    confianca: confiancaMatch ? Number(confiancaMatch[1]) : 55,
    sintomas,
    nomeCientifico: cientifico?.[1]?.trim() || null,
    recomendacao: recomendacao?.trim() || undefined,
    resumo: resumo?.trim() || undefined,
  };
}

function interpretarRespostaIa(
  textoBruto: string,
  motor: 'ollama' | 'gemini',
  sintomasVisuaisFallback: string[] = [],
  culturaPreferida?: string,
): Diagnostico | null {
  const texto = textoBruto
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json|```/gi, '')
    .trim();
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');

  let dados: Record<string, unknown> | null = null;
  if (inicio >= 0 && fim > inicio) {
    try {
      dados = JSON.parse(texto.slice(inicio, fim + 1)) as Record<string, unknown>;
    } catch {
      dados = null;
    }
  }
  // LLaVA corta o JSON a meio (aspas/chaves a mais) — recuperar campos por regex.
  if (!dados) dados = extrairCamposSoltos(texto);
  if (!dados) return null;

  let sintomas = limparSintomas(dados.sintomas);
  if (sintomas.length === 0 && sintomasVisuaisFallback.length > 0) {
    sintomas = [...sintomasVisuaisFallback];
  }
  const confiancaBruta = dados.confianca ?? dados['confiança'] ?? dados.confidence;
  let confianca = Math.max(0, Math.min(100, Math.round(Number(confiancaBruta) || 0)));
  const pragaBruta =
    typeof dados.praga === 'string' && dados.praga.trim() ? dados.praga.trim() : 'Indeterminado';
  const recomendacaoBruta =
    dados.recomendacao ?? dados['recomendacão'] ?? dados['recomendação'] ?? dados.recommendation;
  let recomendacao =
    typeof recomendacaoBruta === 'string' && recomendacaoBruta.trim()
      ? recomendacaoBruta.trim()
      : 'Confirme no campo com um técnico.';
  if (recomendacao.length > 160) recomendacao = `${recomendacao.slice(0, 157).trim()}…`;
  let resumo =
    typeof dados.resumo === 'string' && dados.resumo.trim() && dados.resumo.trim() !== '...'
      ? dados.resumo.trim()
      : `Diagnóstico por IA: ${pragaBruta}.`;
  if (resumo.length < 12 || /^[\.…]{1,5}$/.test(resumo)) {
    resumo = `Diagnóstico por IA: ${pragaBruta}.`;
  }
  if (resumo.length > 180) resumo = `${resumo.slice(0, 177).trim()}…`;
  const limpo = limparNomePraga(pragaBruta, recomendacao, resumo);
  let praga = limpo.praga;
  recomendacao = limpo.recomendacao;
  resumo = limpo.resumo;
  let nomeCientifico =
    typeof dados.nomeCientifico === 'string' && dados.nomeCientifico.trim() ? dados.nomeCientifico.trim() : null;
  const culturaBruta = typeof dados.culturaDetectada === 'string' ? dados.culturaDetectada : null;
  const culturaDetectada =
    (culturaBruta && CULTURAS.has(culturaBruta) ? culturaBruta : null) ??
    (culturaPreferida && CULTURAS.has(culturaPreferida) ? culturaPreferida : null);

  // LLaVA muitas vezes responde em inglês ("Northern leaf blight") — mapear antes de rejeitar.
  const conhecido =
    normalizarPragaConhecida(praga) ??
    (nomeCientifico ? normalizarPragaConhecida(nomeCientifico) : null) ??
    normalizarPragaConhecida(resumo);
  if (conhecido) {
    praga = conhecido.praga;
    if (!nomeCientifico && conhecido.nomeCientifico) nomeCientifico = conhecido.nomeCientifico;
    if (!/lesão|lesao|folha|necr|cinzent|castanh|amare|visto|photograph|image/i.test(resumo)) {
      resumo = `Lesão vista na fotografia — ${conhecido.praga}.`;
    }
    confianca = Math.max(confianca, 62);
  }

  const sintomasFoliar =
    sintomas.includes('manchas_amarelas') || sintomas.includes('folhas_secas') || sintomas.includes('murcha');

  let hipotese = /hipótese|por confirmar/i.test(praga);
  let alternativas: string[] = [];

  // "Praga do milho" / clorose genérica → nome científico ou hipótese por sintomas.
  if (!conhecido && (nomePragaInutil(praga) || /^clorose\b/i.test(praga))) {
    const porCiencia = pragaPorNomeCientifico(nomeCientifico);
    // Fusarium na espiga não explica bem foto de folha amarela/seca — preferir hipótese foliar.
    if (porCiencia && !(sintomasFoliar && patogenoPoucaFoliar(nomeCientifico))) {
      praga = porCiencia;
      resumo = `Diagnóstico por IA (nome científico): ${porCiencia}.`;
      confianca = Math.min(confianca, 70);
      hipotese = false;
      alternativas = [];
    } else {
      // Preferir sintomas visuais medidos se a IA não listou necrose/secura.
      const sintomasHipotese =
        sintomasVisuaisFallback.length > sintomas.length
          ? [...new Set([...sintomas, ...sintomasVisuaisFallback])]
          : sintomas;
      const hip = hipotesePorSintomas(culturaDetectada, sintomasHipotese);
      if (!hip) return null;
      praga = hip.praga;
      nomeCientifico = hip.nomeCientifico;
      recomendacao = hip.recomendacao;
      alternativas = hip.alternativas;
      sintomas = sintomasHipotese.length > 0 ? sintomasHipotese : sintomas;
      hipotese = true;
      resumo = `IA de visão indecisa — hipótese por lesões/sintomas${culturaDetectada ? ` em ${culturaDetectada}` : ''}: ${hip.praga}. Confirme no talhão.`;
      confianca = sintomasHipotese.includes('folhas_secas')
        ? Math.min(52, Math.max(38, confianca || 45))
        : Math.min(40, Math.max(28, confianca));
    }
  }

  if (/indeterminado/i.test(praga) && sintomas.length > 0) {
    hipotese = true;
    confianca = Math.min(confianca, 45);
    if (/qualidade|desfoc|borrad|nítid|nitid/i.test(resumo)) {
      resumo = `Sintomas visíveis (${sintomas.join(', ')})${culturaPreferida ? ` em ${culturaPreferida}` : ''}; praga específica por confirmar.`;
    }
  }
  if (confianca === 0 && (sintomas.length > 0 || (praga !== 'Indeterminado' && praga.length > 2))) {
    confianca = hipotese ? 38 : 55;
  }
  // LLaVA marca 100 % com frequência; limitar confiança do motor de visão.
  if (motor === 'ollama') confianca = Math.min(confianca, hipotese ? 45 : 78);
  if (motor === 'gemini') confianca = Math.min(confianca, hipotese ? 50 : 88);

  const pragaParaRef = praga
    .replace(/\s*\(hipótese\)\s*/i, '')
    .replace(/\s*\(por confirmar\)\s*/i, '')
    .trim();
  const refPraga = pragaParaRef || 'Queima foliar do milho';

  return {
    praga,
    nomeCientifico,
    culturaDetectada,
    sintomas,
    confianca,
    recomendacao,
    motor,
    resumo,
    hipotese,
    alternativas,
    ...anexarReferencia({
      praga: refPraga,
      nomeCientifico,
      cultura: culturaDetectada,
      limite: 4,
    }),
  };
}

/** /api/generate é o caminho nativo do LLaVA com imagens; /api/chat como reserva. */
async function chamarOllamaVisao(
  modelo: string,
  prompt: string,
  imagemBase64: string,
): Promise<string | null> {
  const opcoes = { temperature: 0.05, num_predict: 320 };
  const timeout = AbortSignal.timeout(150000);

  try {
    const gerar = await fetch(`${hostOllama()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        prompt,
        images: [imagemBase64],
        stream: false,
        options: opcoes,
      }),
      signal: timeout,
    });
    if (gerar.ok) {
      const corpo = (await gerar.json()) as { response?: string };
      const texto = corpo.response?.trim();
      if (texto) return texto;
    }
  } catch {
    /* tenta chat abaixo */
  }

  try {
    const chat = await fetch(`${hostOllama()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        stream: false,
        options: opcoes,
        messages: [{ role: 'user', content: prompt, images: [imagemBase64] }],
      }),
      signal: AbortSignal.timeout(150000),
    });
    if (!chat.ok) return null;
    const corpo = (await chat.json()) as { message?: { content?: string } };
    return corpo.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

function diagnosticoVisaoFraco(diag: Diagnostico | null): boolean {
  if (!diag) return true;
  if (diag.hipotese) return true;
  if (nomePragaInutil(diag.praga)) return true;
  if (/indecisa|hipótese por|por sintomas|não descreveu a lesão/i.test(diag.resumo)) return true;
  return false;
}

function descricaoPareceVisao(texto: string | null): boolean {
  if (!texto || texto.trim().length < 18) return false;
  return /leaf|folha|lesion|lesão|lesao|necrot|brown|yellow|amarel|cinzent|castanh|streak|stripe|cigar|hole|buraco|spot|mancha|grey|gray|dead|seco/i.test(
    texto,
  );
}

async function diagnosticarOllama(buffer: Buffer, culturaPreferida?: string): Promise<Diagnostico | null> {
  const escolhido = await escolherModeloOllama();
  // Sem modelo de visão não enviamos imagem — evita “diagnóstico” só a partir do texto.
  if (!escolhido?.visao) return null;

  const sinais = extrairSinais(buffer);
  const sintomas = sintomasVisuais(sinais);
  const jpegVisao = reduzirJpegParaVisao(buffer, 896);
  const imagem = jpegVisao.toString('base64');

  const tentarTexto = (prompt: string) => chamarOllamaVisao(escolhido.modelo, prompt, imagem);
  const tentarDiag = async (prompt: string) => {
    const texto = await tentarTexto(prompt);
    if (!texto) return null;
    return interpretarRespostaIa(texto, 'ollama', sintomas, culturaPreferida);
  };

  // 1) Descrever a lesão na foto — força o modelo a usar os píxeis.
  const descricao = await tentarTexto(promptDescricaoVisao(culturaPreferida));
  const notas = descricao && descricaoPareceVisao(descricao) ? descricao : undefined;

  // 2) Diagnóstico com a mesma imagem (+ notas visuais se existirem).
  let diag = await tentarDiag(promptVisao(culturaPreferida, notas));

  // 3) Passagem curta se ainda genérico / hipótese.
  if (diagnosticoVisaoFraco(diag)) {
    const segunda = await tentarDiag(promptVisaoCurto(culturaPreferida));
    if (segunda && !diagnosticoVisaoFraco(segunda)) {
      diag = segunda;
    } else if (
      segunda &&
      (!diag || (segunda.confianca >= (diag?.confianca ?? 0) && !nomePragaInutil(segunda.praga)))
    ) {
      diag = segunda;
    }
  }

  // 4) Se a descrição visual aponta queima/cigar e o JSON falhou, mapear directamente.
  if (diagnosticoVisaoFraco(diag) && notas) {
    const porDescricao = normalizarPragaConhecida(notas);
    const cigarNecrose =
      /cigar|elongat|grey[\s-]?brown|gray[\s-]?brown|necrotic\s+streak|lesão\s+along|lesao\s+along|faixa\s+castanh/i.test(
        notas,
      );
    if (porDescricao || (cigarNecrose && culturaPreferida === 'Milho')) {
      const praga = porDescricao?.praga ?? 'Queima foliar do milho';
      const ciencia = porDescricao?.nomeCientifico ?? 'Exserohilum turcicum';
      diag = {
        praga,
        nomeCientifico: ciencia,
        culturaDetectada: culturaPreferida && CULTURAS.has(culturaPreferida) ? culturaPreferida : null,
        sintomas: sintomas.length > 0 ? sintomas : ['manchas_amarelas', 'folhas_secas'],
        confianca: 68,
        recomendacao:
          'Lesão alongada observada na fotografia. Confirme no talhão antes de tratar.',
        motor: 'ollama',
        resumo: `Visto na fotografia: ${notas.slice(0, 160)}`,
        hipotese: false,
        alternativas: [],
        ...anexarReferencia({
          praga,
          nomeCientifico: ciencia,
          cultura: culturaPreferida && CULTURAS.has(culturaPreferida) ? culturaPreferida : null,
          limite: 4,
        }),
      };
    }
  }

  if (!diag) return null;

  if (diagnosticoVisaoFraco(diag)) {
    return {
      ...diag,
      hipotese: true,
      resumo: diag.resumo.includes('visão')
        ? diag.resumo
        : `A IA de visão não descreveu a lesão da foto; hipótese auxiliar: ${diag.praga}.`,
    };
  }

  return {
    ...diag,
    hipotese: false,
    resumo:
      diag.resumo.startsWith('Diagnóstico') ||
      /lesão|lesao|folha|necr|cinzent|castanh|amare|visto|photograph/i.test(diag.resumo)
        ? diag.resumo
        : `Visto na fotografia: ${diag.resumo}`,
  };
}

async function comTempoLimite<T>(promessa: Promise<T>, ms: number): Promise<T | null> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa.then((valor) => valor).catch(() => null),
      new Promise<null>((resolver) => {
        temporizador = setTimeout(() => resolver(null), ms);
      }),
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

async function diagnosticarGemini(
  buffer: Buffer,
  chave: string,
  culturaPreferida?: string,
): Promise<Diagnostico | null> {
  const sinais = extrairSinais(buffer);
  const sintomas = sintomasVisuais(sinais);
  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(chave)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptDiagnostico(sinais, sintomas, culturaPreferida) },
              { inline_data: { mime_type: 'image/jpeg', data: buffer.toString('base64') } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    },
  );

  if (!resposta.ok) return null;
  const corpo = (await resposta.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const texto = corpo.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) return null;
  return interpretarRespostaIa(texto, 'gemini', sintomas, culturaPreferida);
}

function eJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

interface ClasseOpenEpi {
  praga: string;
  nomeCientifico: string | null;
  cultura: string | null;
  saudavel: boolean;
  sintomas: string[];
  recomendacao: string;
  imagens: string[];
}

/** OpenEPI multi-HLT — milho, mandioca, feijão (África). Imagens: Wikimedia Commons (CC). */
const CLASSES_OPENEPI: Record<string, ClasseOpenEpi> = {
  HLT_cassava: {
    praga: 'Mandioca aparentemente saudável',
    nomeCientifico: null,
    cultura: 'Mandioca',
    saudavel: true,
    sintomas: [],
    recomendacao: 'Sem sinais claros de doença. Continue a monitorização semanal do talhão.',
    imagens: [],
  },
  CBSD_cassava: {
    praga: 'Estría castanha da mandioca (CBSD)',
    nomeCientifico: 'Cassava brown streak virus',
    cultura: 'Mandioca',
    saudavel: false,
    sintomas: ['manchas_amarelas', 'folhas_secas'],
    recomendacao: 'Elimine plantas afectadas e use material de plantio certificado sem vírus.',
    imagens: [],
  },
  CMD_cassava: {
    praga: 'Mosaico da mandioca (CMD)',
    nomeCientifico: 'Cassava mosaic virus',
    cultura: 'Mandioca',
    saudavel: false,
    sintomas: ['manchas_amarelas'],
    recomendacao: 'Use material de plantio limpo e elimine plantas fortemente afectadas.',
    imagens: [],
  },
  HLT_maize: {
    praga: 'Milho aparentemente saudável',
    nomeCientifico: null,
    cultura: 'Milho',
    saudavel: true,
    sintomas: [],
    recomendacao: 'Sem sinais claros de doença. Continue a monitorização do cartucho e das folhas.',
    imagens: [],
  },
  MLN_maize: {
    praga: 'Necrose letal do milho (MLN)',
    nomeCientifico: 'Maize lethal necrosis',
    cultura: 'Milho',
    saudavel: false,
    sintomas: ['manchas_amarelas', 'folhas_secas', 'murcha'],
    recomendacao: 'Retire plantas sintomáticas e evite monocultura contínua; use variedades tolerantes se disponíveis.',
    imagens: [],
  },
  MSV_maize: {
    praga: 'Vírus do riscado do milho (MSV)',
    nomeCientifico: 'Maize streak virus',
    cultura: 'Milho',
    saudavel: false,
    sintomas: ['manchas_amarelas'],
    recomendacao: 'Controle cigarrinhas vectoras e prefira variedades resistentes na próxima sementeira.',
    imagens: [],
  },
  FAW_maize: {
    praga: 'Lagarta-do-cartucho',
    nomeCientifico: 'Spodoptera frugiperda',
    cultura: 'Milho',
    saudavel: false,
    sintomas: ['pragas_visiveis', 'folhas_secas'],
    recomendacao: 'Inspeccione o cartucho. Se houver larvas, use controlo biológico ou insecticida indicado.',
    imagens: [],
  },
  MLB_maize: {
    praga: 'Queima foliar do milho',
    nomeCientifico: 'Exserohilum turcicum',
    cultura: 'Milho',
    saudavel: false,
    sintomas: ['manchas_amarelas', 'folhas_secas'],
    recomendacao: 'Remova folhas muito afectadas e avalie fungicida recomendado para milho na zona.',
    imagens: [],
  },
  HLT_beans: {
    praga: 'Feijão aparentemente saudável',
    nomeCientifico: null,
    cultura: 'Feijão',
    saudavel: true,
    sintomas: [],
    recomendacao: 'Sem sinais claros de doença. Continue a monitorização das folhas.',
    imagens: [],
  },
  BR_beans: {
    praga: 'Ferrugem do feijão',
    nomeCientifico: 'Uromyces appendiculatus',
    cultura: 'Feijão',
    saudavel: false,
    sintomas: ['manchas_amarelas', 'folhas_secas'],
    recomendacao: 'Evite irrigação por aspersão excessiva e considere fungicida se a incidência subir.',
    imagens: [],
  },
  ALS_beans: {
    praga: 'Mancha angular do feijão',
    nomeCientifico: 'Pseudocercospora griseola',
    cultura: 'Feijão',
    saudavel: false,
    sintomas: ['manchas_amarelas', 'folhas_secas'],
    recomendacao: 'Remova restos de cultura infectados e use sementes sãs na próxima época.',
    imagens: [],
  },
};

async function diagnosticarOpenEpi(buffer: Buffer): Promise<Diagnostico | null> {
  const resposta = await fetch('https://api.openepi.io/crop-health/predictions/multi-HLT', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buffer,
    signal: AbortSignal.timeout(8000),
  });
  if (!resposta.ok) return null;

  const scores = (await resposta.json()) as Record<string, number>;
  const ordenado = Object.entries(scores)
    .filter(([, score]) => typeof score === 'number' && Number.isFinite(score))
    .sort((a, b) => b[1] - a[1]);
  const melhor = ordenado[0];
  if (!melhor || melhor[1] < 0.15) return null;

  const [codigo, probabilidade] = melhor;
  const meta = CLASSES_OPENEPI[codigo];
  if (!meta) return null;
  // Saudável com baixa margem → deixa outros motores tentar
  if (meta.saudavel && probabilidade < 0.55) return null;

  const confianca = Math.max(35, Math.min(96, Math.round(probabilidade * 100)));
  return {
    praga: meta.praga,
    nomeCientifico: meta.nomeCientifico,
    culturaDetectada: meta.cultura,
    sintomas: meta.sintomas,
    confianca,
    recomendacao: meta.recomendacao,
    motor: 'openepi',
    resumo: `OpenEPI: ${meta.praga} com ${confianca}\u00a0% de confiança${meta.cultura ? ` em ${meta.cultura}` : ''}.`,
    hipotese: false,
    alternativas: [],
    ...anexarReferencia({
      codigoOpenEpi: codigo,
      praga: meta.praga,
      nomeCientifico: meta.nomeCientifico,
      cultura: meta.cultura,
      limite: 4,
    }),
  };
}

export async function diagnosticarImagem(buffer: Buffer, culturaPreferida?: string): Promise<Diagnostico> {
  const reserva = diagnosticarLocal(buffer, culturaPreferida);
  // OpenEPI cobre milho, mandioca e feijão — não tomate.
  const openepiServe =
    !culturaPreferida || culturaPreferida === 'Milho' || culturaPreferida === 'Mandioca' || culturaPreferida === 'Feijão';

  // Arrancar Ollama já (60–150 s); OpenEPI em paralelo.
  const pedidoOllama = comTempoLimite(diagnosticarOllama(buffer, culturaPreferida), 150000);
  const pedidoOpenEpi = openepiServe ? comTempoLimite(diagnosticarOpenEpi(buffer), 8000) : Promise.resolve(null);

  const openepi = await pedidoOpenEpi;
  if (openepi && openepi.confianca > 0 && !openepi.hipotese) return openepi;

  const ollama = await pedidoOllama;
  // Preferir identificação que olhou para a foto (não só hipótese por cor).
  if (ollama && !diagnosticoVisaoFraco(ollama) && ollama.confianca > 0) return ollama;

  const chave = process.env.GEMINI_API_KEY?.trim();
  if (chave) {
    const ia = await comTempoLimite(diagnosticarGemini(buffer, chave, culturaPreferida), 20000);
    if (ia && !diagnosticoVisaoFraco(ia) && (ia.confianca > 0 || ia.sintomas.length > 0)) return ia;
    if (ia && (ia.confianca > 0 || ia.sintomas.length > 0) && diagnosticoVisaoFraco(ollama)) return ia;
  }

  if (ollama && (ollama.confianca > 0 || ollama.sintomas.length > 0)) return ollama;
  if (openepi && openepi.confianca > 0) return openepi;

  return reserva;
}

export async function diagnosticoHandler(req: Request, res: Response): Promise<void> {
  const identidade = identificarPedido(req);
  if (!identidade || !identidade.email) {
    res.status(401).json({ erro: 'Sessão inválida' });
    return;
  }

  const culturaBruta = typeof req.query.cultura === 'string' ? req.query.cultura : 'Milho';
  const cultura = CULTURAS.has(culturaBruta) ? culturaBruta : 'Milho';
  const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (corpo.length === 0) {
    res.status(400).json({ erro: 'Envie uma fotografia JPEG' });
    return;
  }
  if (!eJpeg(corpo)) {
    res.status(400).json({ erro: 'A fotografia deve ser JPEG' });
    return;
  }

  try {
    const diagnostico = await diagnosticarImagem(corpo, cultura);
    res.status(200).json({ diagnostico });
  } catch {
    res.status(500).json({ erro: 'Não foi possível diagnosticar a fotografia' });
  }
}
