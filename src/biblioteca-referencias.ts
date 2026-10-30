import catalogoJson from './biblioteca-referencias.dados.json';

export interface EntradaReferencia {
  id: string;
  cultura: string;
  rotulo: string;
  cientifico: string | null;
  imagens: string[];
  fontes?: string[];
}

const ENTRADAS = (catalogoJson as { entradas: EntradaReferencia[] }).entradas ?? [];

const OPENEPI_PARA_ID: Record<string, string> = {
  FAW_maize: 'milho-lagarta-cartucho',
  MLB_maize: 'milho-queima-foliar',
  MSV_maize: 'milho-riscado',
  MLN_maize: 'milho-queima-foliar',
  CMD_cassava: 'mandioca-mosaico',
  CBSD_cassava: 'mandioca-estria',
  BR_beans: 'feijao-ferrugem',
  ALS_beans: 'feijao-mancha-angular',
};

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pontuarEntrada(entrada: EntradaReferencia, consulta: string, cultura?: string | null): number {
  if (entrada.imagens.length === 0) return -1;
  let pontos = 0;
  const rotulo = normalizar(entrada.rotulo);
  const cientifico = normalizar(entrada.cientifico ?? '');
  if (consulta.includes(rotulo) || rotulo.includes(consulta)) pontos += 8;
  if (cientifico && (consulta.includes(cientifico) || cientifico.includes(consulta))) pontos += 10;
  for (const termo of rotulo.split(' ')) {
    if (termo.length > 3 && consulta.includes(termo)) pontos += 2;
  }
  for (const termo of cientifico.split(' ')) {
    if (termo.length > 3 && consulta.includes(termo)) pontos += 3;
  }
  if (cultura && entrada.cultura === cultura) pontos += 3;
  return pontos;
}

/** Resolve imagens de referência locais (PlantVillage/Commons via catálogo). */
export function imagensReferenciaPara(opcoes: {
  praga?: string | null;
  nomeCientifico?: string | null;
  cultura?: string | null;
  codigoOpenEpi?: string | null;
  limite?: number;
}): string[] {
  const limite = opcoes.limite ?? 4;
  if (opcoes.codigoOpenEpi) {
    const id = OPENEPI_PARA_ID[opcoes.codigoOpenEpi];
    const directa = ENTRADAS.find((item) => item.id === id);
    if (directa?.imagens.length) return directa.imagens.slice(0, limite);
  }

  const praga = (opcoes.praga ?? '').trim();
  // Sem nome de praga concreto não há correspondência fiável com a fotografia.
  if (!praga || /^sintomas detectados|padrao pouco claro|diagnostico indeterminado/i.test(normalizar(praga))) {
    return [];
  }

  const consulta = normalizar([praga, opcoes.nomeCientifico].filter(Boolean).join(' '));
  if (!consulta) return [];

  const ordenadas = ENTRADAS.map((entrada) => ({
    entrada,
    pontos: pontuarEntrada(entrada, consulta, opcoes.cultura),
  }))
    .filter((item) => item.pontos >= 8)
    .sort((a, b) => b.pontos - a.pontos);

  return ordenadas[0]?.entrada.imagens.slice(0, limite) ?? [];
}

export function listarBibliotecaReferencias(): EntradaReferencia[] {
  return ENTRADAS.filter((item) => item.imagens.length > 0);
}
