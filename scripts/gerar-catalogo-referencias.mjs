import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'client', 'public', 'referencias');

const meta = {
  'milho-lagarta-cartucho': { cultura: 'Milho', rotulo: 'Lagarta-do-cartucho', cientifico: 'Spodoptera frugiperda' },
  'milho-ferrugem': { cultura: 'Milho', rotulo: 'Ferrugem do milho', cientifico: 'Puccinia sorghi' },
  'milho-queima-foliar': { cultura: 'Milho', rotulo: 'Queima foliar do milho', cientifico: 'Exserohilum turcicum' },
  'milho-riscado': { cultura: 'Milho', rotulo: 'Vírus do riscado do milho', cientifico: 'Maize streak virus' },
  'mandioca-mosaico': { cultura: 'Mandioca', rotulo: 'Mosaico da mandioca', cientifico: 'Cassava mosaic virus' },
  'mandioca-estria': { cultura: 'Mandioca', rotulo: 'Estría castanha da mandioca', cientifico: 'Cassava brown streak virus' },
  'feijao-ferrugem': { cultura: 'Feijão', rotulo: 'Ferrugem do feijão', cientifico: 'Uromyces appendiculatus' },
  'feijao-mancha-angular': { cultura: 'Feijão', rotulo: 'Mancha angular do feijão', cientifico: 'Pseudocercospora griseola' },
  'feijao-antracnose': { cultura: 'Feijão', rotulo: 'Antracnose do feijão', cientifico: 'Colletotrichum lindemuthianum' },
  'tomate-tuta': { cultura: 'Tomate', rotulo: 'Traça-do-tomateiro', cientifico: 'Tuta absoluta' },
  'tomate-alternaria': { cultura: 'Tomate', rotulo: 'Alternária / pinta-preta', cientifico: 'Alternaria solani' },
  'tomate-mildio': { cultura: 'Tomate', rotulo: 'Míldio do tomateiro', cientifico: 'Phytophthora infestans' },
  'tomate-acaro': { cultura: 'Tomate', rotulo: 'Ácaro-rajado', cientifico: 'Tetranychus urticae' },
  'tomate-enrolamento': { cultura: 'Tomate', rotulo: 'Vírus do enrolamento amarelo', cientifico: 'Tomato yellow leaf curl virus' },
};

const entradas = [];
for (const id of Object.keys(meta).sort()) {
  const pasta = join(destino, id);
  let ficheiros = [];
  try {
    ficheiros = readdirSync(pasta)
      .filter((nome) => /\.(jpe?g|png|webp)$/i.test(nome))
      .filter((nome) => statSync(join(pasta, nome)).isFile())
      .sort();
  } catch {
    continue;
  }
  if (ficheiros.length === 0) continue;
  const info = meta[id];
  entradas.push({
    id,
    cultura: info.cultura,
    rotulo: info.rotulo,
    cientifico: info.cientifico,
    imagens: ficheiros.map((nome) => `/referencias/${id}/${nome}`),
  });
}

const catalogo = { geradoEm: new Date().toISOString(), entradas };
const texto = `${JSON.stringify(catalogo, null, 2)}\n`;
writeFileSync(join(destino, 'catalogo.json'), texto, 'utf8');
writeFileSync(join(raiz, 'src', 'biblioteca-referencias.dados.json'), texto, 'utf8');
console.log(`Entradas: ${entradas.length}`);
for (const item of entradas) console.log(`${item.id}: ${item.imagens.length}`);
