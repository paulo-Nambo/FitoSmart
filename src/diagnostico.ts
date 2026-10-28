import type { Request, Response } from 'express';
import jpeg from 'jpeg-js';
import { identificarPedido } from './auth';

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

interface Hipotese {
  praga: string;
  nomeCientifico: string | null;
  sintomas: string[];
  pesos: { amarelas: number; secas: number; murchas: number; contrastes: number; verde: number };
  recomendacao: string;
}

interface SinaisVisuais {
  amarelas: number;
  secas: number;
  murchas: number;
  contrastes: number;
  verde: number;
}

const BASE_CONHECIMENTO: Record<string, Hipotese[]> = {
  Milho: [
    {
      praga: 'Mancha foliar / helmintosporiose',
      nomeCientifico: 'Bipolaris / Exserohilum',
      sintomas: ['manchas_amarelas', 'folhas_secas'],
      pesos: { amarelas: 1.2, secas: 0.9, murchas: 0.1, contrastes: 0.4, verde: 0.2 },
      recomendacao: 'Remova folhas muito afectadas e avalie fungicida recomendado para milho na zona.',
    },
    {
      praga: 'Lagarta-do-cartucho',
      nomeCientifico: 'Spodoptera frugiperda',
      sintomas: ['pragas_visiveis', 'folhas_secas'],
      pesos: { amarelas: 0.2, secas: 0.5, murchas: 0.1, contrastes: 1.4, verde: 0.3 },
      recomendacao: 'Inspeccione o cartucho. Se houver larvas, use controlo biológico ou insecticida indicado.',
    },
    {
      praga: 'Deficiência nutricional / stress hídrico',
      nomeCientifico: null,
      sintomas: ['manchas_amarelas', 'murcha'],
      pesos: { amarelas: 1, secas: 0.3, murchas: 0.8, contrastes: 0.1, verde: 0.1 },
      recomendacao: 'Verifique irrigação e adubação nitrogenada antes de aplicar pesticida.',
    },
  ],
  Mandioca: [
    {
      praga: 'Mosaico da mandioca',
      nomeCientifico: 'Cassava mosaic virus',
      sintomas: ['manchas_amarelas'],
      pesos: { amarelas: 1.5, secas: 0.3, murchas: 0.2, contrastes: 0.5, verde: 0.2 },
      recomendacao: 'Use material de plantio limpo e elimine plantas fortemente afectadas.',
    },
    {
      praga: 'Ácaro verde da mandioca',
      nomeCientifico: 'Mononychellus tanajoa',
      sintomas: ['pragas_visiveis', 'folhas_secas', 'manchas_amarelas'],
      pesos: { amarelas: 0.7, secas: 0.8, murchas: 0.2, contrastes: 1.1, verde: 0.2 },
      recomendacao: 'Aumente a monitorização das folhas jovens e considere acaricida se a infestação crescer.',
    },
    {
      praga: 'Bacteriose da mandioca',
      nomeCientifico: 'Xanthomonas phaseoli pv. manihotis',
      sintomas: ['folhas_secas', 'murcha'],
      pesos: { amarelas: 0.3, secas: 1.2, murchas: 1, contrastes: 0.3, verde: 0.1 },
      recomendacao: 'Corte e destrua partes afectadas; desinfecte ferramentas de corte.',
    },
  ],
  Feijão: [
    {
      praga: 'Antracnose do feijão',
      nomeCientifico: 'Colletotrichum lindemuthianum',
      sintomas: ['manchas_amarelas', 'folhas_secas'],
      pesos: { amarelas: 1, secas: 1, murchas: 0.2, contrastes: 0.5, verde: 0.2 },
      recomendacao: 'Evite trabalhar com folhagem molhada e use semente tratada na próxima sementeira.',
    },
    {
      praga: 'Ferrugem do feijão',
      nomeCientifico: 'Uromyces appendiculatus',
      sintomas: ['manchas_amarelas', 'folhas_secas'],
      pesos: { amarelas: 1.1, secas: 0.7, murchas: 0.1, contrastes: 0.6, verde: 0.2 },
      recomendacao: 'Melhore a circulação de ar entre linhas e avalie fungicida se a doença avançar.',
    },
    {
      praga: 'Mosca-branca',
      nomeCientifico: 'Bemisia tabaci',
      sintomas: ['pragas_visiveis', 'manchas_amarelas', 'murcha'],
      pesos: { amarelas: 0.6, secas: 0.3, murchas: 0.5, contrastes: 1.2, verde: 0.2 },
      recomendacao: 'Inspeccione a face inferior das folhas e use armadilhas ou controlo indicado.',
    },
  ],
  Tomate: [
    {
      praga: 'Alternária / pinta-preta',
      nomeCientifico: 'Alternaria solani',
      sintomas: ['manchas_amarelas', 'folhas_secas'],
      pesos: { amarelas: 1.1, secas: 1, murchas: 0.2, contrastes: 0.5, verde: 0.2 },
      recomendacao: 'Remova folhas baixas afectadas e evite rega sobre a folhagem.',
    },
    {
      praga: 'Míldio do tomateiro',
      nomeCientifico: 'Phytophthora infestans',
      sintomas: ['manchas_amarelas', 'folhas_secas', 'murcha'],
      pesos: { amarelas: 0.9, secas: 1.1, murchas: 0.7, contrastes: 0.3, verde: 0.1 },
      recomendacao: 'Actue cedo com fungicida adequado e melhore o arejamento da cultura.',
    },
    {
      praga: 'Traça-do-tomateiro',
      nomeCientifico: 'Tuta absoluta',
      sintomas: ['pragas_visiveis', 'folhas_secas'],
      pesos: { amarelas: 0.3, secas: 0.6, murchas: 0.2, contrastes: 1.4, verde: 0.3 },
      recomendacao: 'Procure minas nas folhas e frutos; use armadilhas e controlo integrado.',
    },
  ],
};

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

function pontuar(hipotese: Hipotese, sinais: SinaisVisuais) {
  return (
    hipotese.pesos.amarelas * sinais.amarelas +
    hipotese.pesos.secas * sinais.secas +
    hipotese.pesos.murchas * sinais.murchas +
    hipotese.pesos.contrastes * sinais.contrastes +
    hipotese.pesos.verde * sinais.verde
  );
}

function sintomasVisuais(sinais: SinaisVisuais): string[] {
  const sintomas: string[] = [];
  if (sinais.amarelas >= 0.04) sintomas.push('manchas_amarelas');
  if (sinais.secas >= 0.035) sintomas.push('folhas_secas');
  if (sinais.murchas >= 0.12) sintomas.push('murcha');
  if (sinais.contrastes >= 0.15 && !sintomas.includes('manchas_amarelas')) sintomas.push('pragas_visiveis');
  return sintomas;
}

export function diagnosticarLocal(buffer: Buffer, culturaPreferida?: string): Diagnostico {
  const sinais = extrairSinais(buffer);
  const visiveis = sintomasVisuais(sinais);

  if (visiveis.length === 0) {
    return {
      praga: 'Padrão pouco claro',
      nomeCientifico: null,
      culturaDetectada: null,
      sintomas: [],
      confianca: 0,
      recomendacao: 'Carregue outra fotografia mais próxima da folha afectada.',
      motor: 'fitosmart',
      resumo: 'A fotografia não mostrou um padrão claro para diagnóstico.',
      imagensReferencia: [],
    };
  }

  let melhor: Hipotese | null = null;
  let melhorCultura: string | null = null;
  let melhorPontuacao = -1;

  for (const [cultura, hipoteses] of Object.entries(BASE_CONHECIMENTO)) {
    for (const hipotese of hipoteses) {
      const sobreposicao = hipotese.sintomas.filter((id) => visiveis.includes(id)).length;
      if (sobreposicao === 0) continue;
      let pontos = pontuar(hipotese, sinais) + sobreposicao * 0.04;
      if (culturaPreferida && cultura === culturaPreferida) pontos += 0.012;
      if (pontos > melhorPontuacao) {
        melhorPontuacao = pontos;
        melhor = hipotese;
        melhorCultura = cultura;
      }
    }
  }

  if (!melhor || !melhorCultura || melhorPontuacao < 0.05) {
    return {
      praga: 'Padrão pouco claro',
      nomeCientifico: null,
      culturaDetectada: null,
      sintomas: visiveis,
      confianca: 0,
      recomendacao: 'Os sinais visuais não bastaram para nomear a praga. Confirme no campo.',
      motor: 'fitosmart',
      resumo: 'A fotografia mostrou sintomas, mas a praga ficou indeterminada.',
      imagensReferencia: [],
    };
  }

  const sintomas = [...new Set([...visiveis, ...melhor.sintomas.filter((id) => visiveis.includes(id))])];
  const confianca = Math.max(40, Math.min(93, Math.round(38 + melhorPontuacao * 210 + sintomas.length * 7)));
  const ciencia = melhor.nomeCientifico ? ` (${melhor.nomeCientifico})` : '';
  return {
    praga: melhor.praga,
    nomeCientifico: melhor.nomeCientifico,
    culturaDetectada: melhorCultura,
    sintomas,
    confianca,
    recomendacao: melhor.recomendacao,
    motor: 'fitosmart',
    resumo: `Na fotografia de ${melhorCultura}: ${melhor.praga}${ciencia}, com ${confianca}\u00a0% de confiança.`,
    imagensReferencia: [],
  };
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

async function escolherModeloOllama(): Promise<{ modelo: string; visao: boolean } | null> {
  const configurado = process.env.OLLAMA_MODEL?.trim();
  const modelos = await listarModelosOllama();
  if (modelos.length === 0) return null;
  if (configurado && modelos.includes(configurado)) {
    return { modelo: configurado, visao: eModeloVisao(configurado) };
  }
  const comVisao = modelos.find(eModeloVisao);
  if (comVisao) return { modelo: comVisao, visao: true };
  return { modelo: modelos[0], visao: eModeloVisao(modelos[0]) };
}

function percentual(valor: number) {
  return `${Math.round(valor * 100)}%`;
}

function promptDiagnostico(sinais?: SinaisVisuais, sintomas?: string[]) {
  const base = `És um fitopatologista em Moçambique (UEM). Analisa a evidência da FOTOGRAFIA.
Culturas possíveis: Milho, Mandioca, Feijão, Tomate.
Sintomas possíveis: manchas_amarelas, folhas_secas, murcha, pragas_visiveis.
Responde APENAS JSON válido:
{"culturaDetectada":"Milho"|"Mandioca"|"Feijão"|"Tomate"|null,"praga":"nome comum em português","nomeCientifico":"string ou null","sintomas":["manchas_amarelas"|"folhas_secas"|"murcha"|"pragas_visiveis"],"confianca":0-100,"recomendacao":"ação prática curta","resumo":"frase curta"}
Se não houver evidência clara: culturaDetectada=null, sintomas=[], confianca baixa.`;
  if (!sinais || !sintomas) return base;
  return `${base}

Sinais medidos na fotografia (proporções de píxeis):
- manchas amarelas: ${percentual(sinais.amarelas)}
- folhas secas/castanhas: ${percentual(sinais.secas)}
- murcha/escuro: ${percentual(sinais.murchas)}
- contrastes/textura: ${percentual(sinais.contrastes)}
- verde saudável: ${percentual(sinais.verde)}
Sintomas visuais detectados: ${sintomas.length > 0 ? sintomas.join(', ') : 'nenhum claro'}
Baseia o diagnóstico nestes sinais da imagem.`;
}

function interpretarRespostaIa(textoBruto: string, motor: 'ollama' | 'gemini'): Diagnostico | null {
  const texto = textoBruto
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json|```/gi, '')
    .trim();
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) return null;

  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(texto.slice(inicio, fim + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const sintomas = limparSintomas(dados.sintomas);
  const confianca = Math.max(0, Math.min(100, Math.round(Number(dados.confianca) || 0)));
  const praga = typeof dados.praga === 'string' && dados.praga.trim() ? dados.praga.trim() : 'Diagnóstico indeterminado';
  const recomendacao =
    typeof dados.recomendacao === 'string' && dados.recomendacao.trim()
      ? dados.recomendacao.trim()
      : 'Confirme no campo com um técnico.';
  const resumo =
    typeof dados.resumo === 'string' && dados.resumo.trim()
      ? dados.resumo.trim()
      : `Diagnóstico por IA: ${praga}.`;
  const nomeCientifico =
    typeof dados.nomeCientifico === 'string' && dados.nomeCientifico.trim() ? dados.nomeCientifico.trim() : null;
  const culturaBruta = typeof dados.culturaDetectada === 'string' ? dados.culturaDetectada : null;
  const culturaDetectada = culturaBruta && CULTURAS.has(culturaBruta) ? culturaBruta : null;

  return {
    praga,
    nomeCientifico,
    culturaDetectada,
    sintomas,
    confianca,
    recomendacao,
    motor,
    resumo,
    imagensReferencia: [],
  };
}

async function diagnosticarOllama(buffer: Buffer): Promise<Diagnostico | null> {
  const escolhido = await escolherModeloOllama();
  if (!escolhido) return null;

  const sinais = extrairSinais(buffer);
  const sintomas = sintomasVisuais(sinais);
  const mensagem: { role: string; content: string; images?: string[] } = {
    role: 'user',
    content: escolhido.visao ? promptDiagnostico() : promptDiagnostico(sinais, sintomas),
  };
  if (escolhido.visao) {
    mensagem.images = [buffer.toString('base64')];
  }

  const resposta = await fetch(`${hostOllama()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: escolhido.modelo,
      stream: false,
      format: 'json',
      think: false,
      options: { temperature: 0.1, num_predict: 256 },
      messages: [mensagem],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!resposta.ok) return null;

  const corpo = (await resposta.json()) as { message?: { content?: string } };
  const texto = corpo.message?.content;
  if (!texto) return null;
  return interpretarRespostaIa(texto, 'ollama');
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

async function diagnosticarGemini(buffer: Buffer, chave: string): Promise<Diagnostico | null> {
  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(chave)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptDiagnostico() },
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
  return interpretarRespostaIa(texto, 'gemini');
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
    signal: AbortSignal.timeout(28000),
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
    imagensReferencia: meta.imagens,
  };
}

export async function diagnosticarImagem(buffer: Buffer, culturaPreferida?: string): Promise<Diagnostico> {
  const reserva = diagnosticarLocal(buffer, culturaPreferida);

  const openepi = await comTempoLimite(diagnosticarOpenEpi(buffer), 28000);
  if (openepi && openepi.confianca > 0) return openepi;

  const ollama = await comTempoLimite(diagnosticarOllama(buffer), 20000);
  if (ollama && (ollama.confianca > 0 || ollama.sintomas.length > 0)) return ollama;

  const chave = process.env.GEMINI_API_KEY?.trim();
  if (chave) {
    const ia = await comTempoLimite(diagnosticarGemini(buffer, chave), 20000);
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
