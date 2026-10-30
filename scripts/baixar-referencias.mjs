/**
 * Descarrega imagens de referência (Wikimedia Commons, CC) para client/public/referencias.
 * Uso: node scripts/baixar-referencias.mjs
 */
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'client', 'public', 'referencias');

/** @type {Array<{ id: string; cultura: string; rotulo: string; cientifico?: string; pesquisas: string[] }>} */
const ENTRADAS = [
  {
    id: 'milho-lagarta-cartucho',
    cultura: 'Milho',
    rotulo: 'Lagarta-do-cartucho',
    cientifico: 'Spodoptera frugiperda',
    pesquisas: ['Spodoptera frugiperda larva', 'Fall armyworm maize leaf'],
  },
  {
    id: 'milho-ferrugem',
    cultura: 'Milho',
    rotulo: 'Ferrugem do milho',
    cientifico: 'Puccinia sorghi',
    pesquisas: ['Puccinia sorghi', 'Common rust maize'],
  },
  {
    id: 'milho-queima-foliar',
    cultura: 'Milho',
    rotulo: 'Queima foliar do milho',
    cientifico: 'Exserohilum turcicum',
    pesquisas: ['Northern corn leaf blight', 'Exserohilum turcicum'],
  },
  {
    id: 'milho-riscado',
    cultura: 'Milho',
    rotulo: 'Vírus do riscado do milho',
    cientifico: 'Maize streak virus',
    pesquisas: ['Maize streak virus', 'Maize streak virus symptoms'],
  },
  {
    id: 'mandioca-mosaico',
    cultura: 'Mandioca',
    rotulo: 'Mosaico da mandioca',
    cientifico: 'Cassava mosaic virus',
    pesquisas: ['Cassava mosaic disease', 'Cassava mosaic virus leaf'],
  },
  {
    id: 'mandioca-estria',
    cultura: 'Mandioca',
    rotulo: 'Estría castanha da mandioca',
    cientifico: 'Cassava brown streak virus',
    pesquisas: ['Cassava brown streak disease', 'Cassava brown streak'],
  },
  {
    id: 'feijao-ferrugem',
    cultura: 'Feijão',
    rotulo: 'Ferrugem do feijão',
    cientifico: 'Uromyces appendiculatus',
    pesquisas: ['Bean rust Uromyces', 'Uromyces appendiculatus'],
  },
  {
    id: 'feijao-mancha-angular',
    cultura: 'Feijão',
    rotulo: 'Mancha angular do feijão',
    cientifico: 'Pseudocercospora griseola',
    pesquisas: ['Angular leaf spot bean', 'Phaeoisariopsis griseola'],
  },
  {
    id: 'feijao-antracnose',
    cultura: 'Feijão',
    rotulo: 'Antracnose do feijão',
    cientifico: 'Colletotrichum lindemuthianum',
    pesquisas: ['Bean anthracnose', 'Colletotrichum lindemuthianum'],
  },
  {
    id: 'tomate-tuta',
    cultura: 'Tomate',
    rotulo: 'Traça-do-tomateiro',
    cientifico: 'Tuta absoluta',
    pesquisas: ['Tuta absoluta', 'Tuta absoluta leaf mine'],
  },
  {
    id: 'tomate-alternaria',
    cultura: 'Tomate',
    rotulo: 'Alternária / pinta-preta',
    cientifico: 'Alternaria solani',
    pesquisas: ['Alternaria solani tomato', 'Tomato early blight'],
  },
  {
    id: 'tomate-mildio',
    cultura: 'Tomate',
    rotulo: 'Míldio do tomateiro',
    cientifico: 'Phytophthora infestans',
    pesquisas: ['Phytophthora infestans tomato', 'Tomato late blight'],
  },
  {
    id: 'tomate-acaro',
    cultura: 'Tomate',
    rotulo: 'Ácaro-rajado',
    cientifico: 'Tetranychus urticae',
    pesquisas: ['Tetranychus urticae tomato', 'Two-spotted spider mite leaf'],
  },
  {
    id: 'tomate-enrolamento',
    cultura: 'Tomate',
    rotulo: 'Vírus do enrolamento amarelo',
    cientifico: 'Tomato yellow leaf curl virus',
    pesquisas: ['Tomato yellow leaf curl virus', 'TYLCV tomato'],
  },
];

async function pesquisarCommons(termo) {
  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: `filetype:bitmap ${termo}`,
      srnamespace: '6',
      srlimit: '8',
      format: 'json',
      origin: '*',
    });
  const resposta = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!resposta.ok) return [];
  const dados = await resposta.json();
  return (dados.query?.search ?? []).map((item) => item.title);
}

async function urlsDaImagem(titulo) {
  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      titles: titulo,
      prop: 'imageinfo',
      iiprop: 'url|mime|size',
      iiurlwidth: '720',
      format: 'json',
      origin: '*',
    });
  const resposta = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!resposta.ok) return null;
  const dados = await resposta.json();
  const pagina = Object.values(dados.query?.pages ?? {})[0];
  const info = pagina?.imageinfo?.[0];
  if (!info?.thumburl && !info?.url) return null;
  if (info.mime && !String(info.mime).startsWith('image/')) return null;
  return {
    titulo,
    url: info.thumburl || info.url,
    original: info.url,
  };
}

async function descarregar(url, ficheiro) {
  mkdirSync(dirname(ficheiro), { recursive: true });
  if (existsSync(ficheiro)) return true;
  const resposta = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    headers: { 'User-Agent': 'FitoSmart/1.0 (UEM fitossanidade; educational)' },
  });
  if (!resposta.ok || !resposta.body) return false;
  await pipeline(resposta.body, createWriteStream(ficheiro));
  return true;
}

const catalogo = [];

for (const entrada of ENTRADAS) {
  const escolhidas = [];
  for (const pesquisa of entrada.pesquisas) {
    if (escolhidas.length >= 3) break;
    const titulos = await pesquisarCommons(pesquisa);
    for (const titulo of titulos) {
      if (escolhidas.length >= 3) break;
      if (escolhidas.some((item) => item.titulo === titulo)) continue;
      const info = await urlsDaImagem(titulo);
      if (!info) continue;
      escolhidas.push(info);
    }
  }

  const pasta = join(destino, entrada.id);
  mkdirSync(pasta, { recursive: true });
  const caminhos = [];
  let indice = 1;
  for (const imagem of escolhidas) {
    const nome = `${String(indice).padStart(2, '0')}.jpg`;
    const ficheiro = join(pasta, nome);
    const ok = await descarregar(imagem.url, ficheiro);
    if (ok) {
      caminhos.push(`/referencias/${entrada.id}/${nome}`);
      indice += 1;
    }
  }

  catalogo.push({
    id: entrada.id,
    cultura: entrada.cultura,
    rotulo: entrada.rotulo,
    cientifico: entrada.cientifico ?? null,
    imagens: caminhos,
    fontes: escolhidas.map((item) => item.titulo),
  });
  console.log(`${entrada.id}: ${caminhos.length} imagem(ns)`);
}

writeFileSync(join(destino, 'catalogo.json'), JSON.stringify({ geradoEm: new Date().toISOString(), entradas: catalogo }, null, 2));
writeFileSync(join(raiz, 'src', 'biblioteca-referencias.dados.json'), JSON.stringify({ geradoEm: new Date().toISOString(), entradas: catalogo }, null, 2));
console.log('Catálogo gravado.');
