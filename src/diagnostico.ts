import type { Request, Response } from 'express';
import jpeg from 'jpeg-js';
import { identificarPedido } from './auth';
import { imagensReferenciaPara } from './biblioteca-referencias';

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
}

interface SinaisVisuais {
  amarelas: number;
  secas: number;
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

  if (total === 0) return { amarelas: 0, secas: 0, murchas: 0, contrastes: 0, verde: 0 };
  return {
    amarelas: amarelas / total,
    secas: secas / total,
    murchas: murchas / total,
    contrastes: contrastes / total,
    verde: verde / total,
  };
}

function sintomasVisuais(sinais: SinaisVisuais): string[] {
  const sintomas: string[] = [];
  if (sinais.amarelas >= 0.04) sintomas.push('manchas_amarelas');
  if (sinais.secas >= 0.035) sintomas.push('folhas_secas');
  if (sinais.murchas >= 0.12) sintomas.push('murcha');
  if (sinais.contrastes >= 0.15 && !sintomas.includes('manchas_amarelas')) sintomas.push('pragas_visiveis');
  return sintomas;
}

function hipotesePorSintomas(
  cultura: string | null,
  sintomas: string[],
): { praga: string; nomeCientifico: string | null; recomendacao: string } | null {
  if (!cultura || sintomas.length === 0) return null;
  const tem = (id: string) => sintomas.includes(id);
  if (cultura === 'Milho') {
    if (tem('pragas_visiveis')) {
      return {
        praga: 'Lagarta-do-cartucho (hipótese)',
        nomeCientifico: 'Spodoptera frugiperda',
        recomendacao: 'Inspeccione o cartucho. Confirme larvas antes de tratar.',
      };
    }
    if (tem('manchas_amarelas') && (tem('folhas_secas') || tem('murcha'))) {
      return {
        praga: 'Queima foliar do milho (hipótese)',
        nomeCientifico: 'Exserohilum turcicum',
        recomendacao: 'Compare com as imagens de referência e confirme no talhão.',
      };
    }
    if (tem('manchas_amarelas')) {
      return {
        praga: 'Queima foliar do milho (hipótese)',
        nomeCientifico: 'Exserohilum turcicum',
        recomendacao: 'Clorose amarela: compare com queima foliar e vírus do riscado.',
      };
    }
  }
  if (cultura === 'Mandioca' && tem('manchas_amarelas')) {
    return {
      praga: 'Mosaico da mandioca (hipótese)',
      nomeCientifico: 'Cassava mosaic virus',
      recomendacao: 'Use material de plantio limpo; elimine plantas muito afectadas.',
    };
  }
  if (cultura === 'Feijão' && tem('manchas_amarelas')) {
    return {
      praga: 'Ferrugem / mancha foliar (hipótese)',
      nomeCientifico: null,
      recomendacao: 'Compare com as referências de ferrugem e mancha angular.',
    };
  }
  if (cultura === 'Tomate') {
    if (tem('pragas_visiveis')) {
      return {
        praga: 'Traça-do-tomateiro (hipótese)',
        nomeCientifico: 'Tuta absoluta',
        recomendacao: 'Procure minas nas folhas; confirme antes de tratar.',
      };
    }
    if (tem('manchas_amarelas') || tem('folhas_secas')) {
      return {
        praga: 'Alternária / míldio (hipótese)',
        nomeCientifico: null,
        recomendacao: 'Remova folhas baixas afectadas e melhore o arejamento.',
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
    };
  }

  const dominanteFoliar = sinais.amarelas + sinais.secas >= sinais.contrastes;
  const sintomas = dominanteFoliar
    ? visiveis.filter((id) => id !== 'pragas_visiveis')
    : visiveis;
  const lista = sintomas.length > 0 ? sintomas : visiveis;
  const hipotese = hipotesePorSintomas(cultura, lista);
  const praga = hipotese?.praga ?? 'Sintomas detectados na fotografia';
  const nomeCientifico = hipotese?.nomeCientifico ?? null;

  return {
    praga,
    nomeCientifico,
    culturaDetectada: cultura,
    sintomas: lista,
    confianca: Math.min(48, 30 + lista.length * 6),
    recomendacao:
      hipotese?.recomendacao ??
      'A IA de visão não respondeu a tempo. Os sintomas são por análise de cor — confirme no talhão.',
    motor: 'fitosmart',
    resumo: hipotese
      ? `Hipótese local por sintomas${cultura ? ` em ${cultura}` : ''}: ${hipotese.praga}.`
      : `Estimativa local: ${lista.length} sintoma(s)${cultura ? ` em ${cultura}` : ''}.`,
    imagensReferencia: imagensReferenciaPara({
      praga: hipotese ? hipotese.praga.replace(/\s*\(hipótese\)\s*/i, '').trim() : null,
      nomeCientifico,
      cultura,
      limite: 3,
    }),
  };
}

function reduzirJpegParaVisao(buffer: Buffer, maxLado = 512): Buffer {
  try {
    const imagem = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 64 });
    const escala = Math.min(1, maxLado / Math.max(imagem.width, imagem.height));
    if (escala >= 0.98) return buffer;
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
    return Buffer.from(jpeg.encode({ data, width: largura, height: altura }, 72).data);
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
  const modelo = resolverModeloOllama(process.env.OLLAMA_MODEL?.trim(), modelos);
  if (!modelo) return null;
  return { modelo, visao: eModeloVisao(modelo) };
}

function percentual(valor: number) {
  return `${Math.round(valor * 100)}%`;
}

function promptDiagnostico(sinais?: SinaisVisuais, sintomas?: string[], culturaPreferida?: string) {
  const cultura = culturaPreferida && CULTURAS.has(culturaPreferida) ? culturaPreferida : 'desconhecida';
  const exemplos =
    cultura === 'Milho'
      ? 'Queima foliar do milho | Vírus do riscado | Ferrugem do milho | Lagarta-do-cartucho'
      : cultura === 'Mandioca'
        ? 'Mosaico da mandioca | Estria castanha'
        : cultura === 'Feijão'
          ? 'Ferrugem do feijão | Mancha angular'
          : cultura === 'Tomate'
            ? 'Alternária | Míldio | Traça-do-tomateiro'
            : 'nome da doença';
  const sinaisLinha =
    sinais && sintomas
      ? `Sinais medidos: amarelo ${percentual(sinais.amarelas)}, seco ${percentual(sinais.secas)}, murcha ${percentual(sinais.murchas)}. Sintomas cor: ${sintomas.join(', ') || 'nenhum'}.`
      : '';
  return `Fitopatologista. Cultura: ${cultura}. Foto de folha doente.
${sinaisLinha}
"praga" = nome ESPECÍFICO da doença (máx. 5 palavras). PROIBIDO: "Praga do milho", "Doença do milho", só o nome da cultura. Exemplos: ${exemplos}.
Não digas que a foto está desfocada se houver manchas/amarelo. confianca realista (40-85).
JSON (chave confianca SEM acento):
{"praga":"...","nomeCientifico":null,"sintomas":["manchas_amarelas"],"confianca":0-100,"recomendacao":"...","resumo":"..."}`;
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

  const sintomasFoliar =
    sintomas.includes('manchas_amarelas') || sintomas.includes('folhas_secas') || sintomas.includes('murcha');

  // "Praga do milho" / só cultura → tentar nome científico; senão hipótese por sintomas.
  if (nomePragaInutil(praga)) {
    const porCiencia = pragaPorNomeCientifico(nomeCientifico);
    // Fusarium na espiga não explica bem foto de folha amarela/seca — preferir hipótese foliar.
    if (porCiencia && !(sintomasFoliar && patogenoPoucaFoliar(nomeCientifico))) {
      praga = porCiencia;
      resumo = `Diagnóstico por IA (nome científico): ${porCiencia}.`;
      confianca = Math.min(confianca, 70);
    } else {
      const hip = hipotesePorSintomas(culturaDetectada, sintomas);
      if (!hip) return null;
      praga = hip.praga;
      nomeCientifico = hip.nomeCientifico;
      recomendacao = hip.recomendacao;
      resumo = `IA de visão indecisa; hipótese por sintomas: ${hip.praga}.`;
      confianca = Math.min(Math.max(confianca, 42), 58);
    }
  }

  if (/indeterminado/i.test(praga) && sintomas.length > 0) {
    confianca = Math.max(confianca, 40);
    if (/qualidade|desfoc|borrad|nítid|nitid/i.test(resumo)) {
      resumo = `Sintomas visíveis (${sintomas.join(', ')})${culturaPreferida ? ` em ${culturaPreferida}` : ''}; praga específica por confirmar.`;
    }
  }
  if (confianca === 0 && (sintomas.length > 0 || (praga !== 'Indeterminado' && praga.length > 2))) {
    confianca = 55;
  }
  // LLaVA marca 100 % com frequência; limitar confiança do motor de visão.
  if (motor === 'ollama') confianca = Math.min(confianca, 78);
  if (motor === 'gemini') confianca = Math.min(confianca, 88);

  return {
    praga,
    nomeCientifico,
    culturaDetectada,
    sintomas,
    confianca,
    recomendacao,
    motor,
    resumo,
    imagensReferencia: imagensReferenciaPara({
      praga: praga.replace(/\s*\(hipótese\)\s*/i, '').trim(),
      nomeCientifico,
      cultura: culturaDetectada,
      limite: 4,
    }),
  };
}

async function chamarOllamaChat(
  modelo: string,
  mensagem: { role: string; content: string; images?: string[] },
  comFormatJson: boolean,
): Promise<string | null> {
  const corpoPedido: Record<string, unknown> = {
    model: modelo,
    stream: false,
    options: { temperature: 0.1, num_predict: 160 },
    messages: [mensagem],
  };
  if (comFormatJson) corpoPedido.format = 'json';
  if (/qwen3|deepseek-r1/i.test(modelo)) corpoPedido.think = false;

  const resposta = await fetch(`${hostOllama()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpoPedido),
    signal: AbortSignal.timeout(150000),
  });
  if (!resposta.ok) return null;
  const corpo = (await resposta.json()) as { message?: { content?: string } };
  return corpo.message?.content?.trim() || null;
}

async function diagnosticarOllama(buffer: Buffer, culturaPreferida?: string): Promise<Diagnostico | null> {
  const escolhido = await escolherModeloOllama();
  if (!escolhido) return null;

  const sinais = extrairSinais(buffer);
  const sintomas = sintomasVisuais(sinais);
  const jpegVisao = escolhido.visao ? reduzirJpegParaVisao(buffer, 512) : buffer;
  const mensagem: { role: string; content: string; images?: string[] } = {
    role: 'user',
    content: promptDiagnostico(sinais, sintomas, culturaPreferida),
  };
  if (escolhido.visao) {
    mensagem.images = [jpegVisao.toString('base64')];
  }

  // Uma só tentativa: o 2.º round (~100 s) estourava o limite e caía no local.
  const texto = await chamarOllamaChat(escolhido.modelo, mensagem, true);
  if (!texto) return null;
  return interpretarRespostaIa(texto, 'ollama', sintomas, culturaPreferida);
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
  const imagensReferencia = imagensReferenciaPara({
    codigoOpenEpi: codigo,
    praga: meta.praga,
    nomeCientifico: meta.nomeCientifico,
    cultura: meta.cultura,
    limite: 4,
  });
  return {
    praga: meta.praga,
    nomeCientifico: meta.nomeCientifico,
    culturaDetectada: meta.cultura,
    sintomas: meta.sintomas,
    confianca,
    recomendacao: meta.recomendacao,
    motor: 'openepi',
    resumo: `OpenEPI: ${meta.praga} com ${confianca}\u00a0% de confiança${meta.cultura ? ` em ${meta.cultura}` : ''}.`,
    imagensReferencia,
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
  if (openepi && openepi.confianca > 0) return openepi;

  const ollama = await pedidoOllama;
  if (ollama && (ollama.confianca > 0 || ollama.sintomas.length > 0)) return ollama;

  const chave = process.env.GEMINI_API_KEY?.trim();
  if (chave) {
    const ia = await comTempoLimite(diagnosticarGemini(buffer, chave, culturaPreferida), 20000);
    if (ia && (ia.confianca > 0 || ia.sintomas.length > 0)) return ia;
  }

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
