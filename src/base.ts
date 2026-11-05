import { randomUUID } from 'crypto';
import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { Pool, type QueryResultRow } from 'pg';
import catalogoReferencias from './biblioteca-referencias.dados.json';
import { CONTAS_INICIAIS, type Conta } from './credenciais';
import type { ContaPublica, Ocorrencia, Parcela, Perfil, Severidade } from './tipos';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS utilizadores (
  email text PRIMARY KEY,
  hash bytea NOT NULL,
  perfil text NOT NULL CHECK (perfil IN ('AGRICULTOR', 'TECNICO')),
  nome text NOT NULL DEFAULT '',
  organizacao text
);

CREATE TABLE IF NOT EXISTS parcelas (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  autor_email text,
  criada_em timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS referencias_entradas (
  id text PRIMARY KEY,
  cultura text NOT NULL,
  rotulo text NOT NULL,
  cientifico text
);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id uuid PRIMARY KEY,
  cultura text NOT NULL,
  sintomas text[] NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  confianca integer NOT NULL,
  status text NOT NULL CHECK (status IN ('TRIADA', 'ENCAMINHADA', 'VALIDADA')),
  autor_email text,
  criada_em timestamptz NOT NULL,
  imagens text[] NOT NULL DEFAULT '{}',
  parcela_id uuid REFERENCES parcelas(id),
  referencia_id text REFERENCES referencias_entradas(id),
  severidade smallint CHECK (severidade IS NULL OR (severidade BETWEEN 1 AND 5)),
  validada_em timestamptz
);

CREATE TABLE IF NOT EXISTS referencias_imagens (
  entrada_id text NOT NULL REFERENCES referencias_entradas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  conteudo bytea NOT NULL,
  content_type text NOT NULL DEFAULT 'image/jpeg',
  PRIMARY KEY (entrada_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_parcelas_autor_nome
  ON parcelas (autor_email, lower(nome));
`;

const ocorrenciasMemoria: Ocorrencia[] = [];
const parcelasMemoria: Parcela[] = [];

function copiarContas(): Conta[] {
  return CONTAS_INICIAIS.map((conta) => ({
    email: conta.email,
    perfil: conta.perfil,
    hash: Buffer.from(conta.hash),
    nome: conta.nome,
    organizacao: conta.organizacao,
  }));
}

let utilizadoresMemoria: Conta[] = copiarContas();

export class ContaDuplicada extends Error {
  constructor() {
    super('Já existe uma conta com este email');
    this.name = 'ContaDuplicada';
  }
}

let pool: Pool | null = null;

function urlDaBase(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return url;
}

function obterPool(): Pool | null {
  const url = urlDaBase();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 10 });
    pool.on('error', () => {
      console.error('Ligação PostgreSQL interrompida');
    });
  }
  return pool;
}

export function reporEstado(): void {
  ocorrenciasMemoria.length = 0;
  parcelasMemoria.length = 0;
  utilizadoresMemoria = copiarContas();
}

function mapearContaPublica(linha: {
  email: string;
  perfil: string;
  nome?: string | null;
  organizacao?: string | null;
}): ContaPublica {
  return {
    email: String(linha.email),
    perfil: linha.perfil === 'TECNICO' ? 'TECNICO' : 'AGRICULTOR',
    nome: String(linha.nome ?? '').trim() || String(linha.email).split('@')[0] || 'Sem nome',
    organizacao:
      linha.organizacao === null || linha.organizacao === undefined || String(linha.organizacao).trim() === ''
        ? null
        : String(linha.organizacao).trim(),
  };
}

function lerSeveridade(valor: unknown): Severidade | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 5) return null;
  return numero as Severidade;
}

function mapear(linha: QueryResultRow): Ocorrencia {
  return {
    id: String(linha.id),
    cultura: String(linha.cultura),
    sintomas: Array.isArray(linha.sintomas) ? linha.sintomas.map(String) : [],
    latitude: Number(linha.latitude),
    longitude: Number(linha.longitude),
    confianca: Number(linha.confianca),
    status: linha.status as Ocorrencia['status'],
    autorEmail: linha.autor_email === null || linha.autor_email === undefined ? null : String(linha.autor_email),
    criadaEm: new Date(linha.criada_em as string).toISOString(),
    imagens: Array.isArray(linha.imagens) ? linha.imagens.map(String) : [],
    parcelaId: linha.parcela_id === null || linha.parcela_id === undefined ? null : String(linha.parcela_id),
    parcelaNome: linha.parcela_nome === null || linha.parcela_nome === undefined ? null : String(linha.parcela_nome),
    referenciaId:
      linha.referencia_id === null || linha.referencia_id === undefined ? null : String(linha.referencia_id),
    referenciaRotulo:
      linha.referencia_rotulo === null || linha.referencia_rotulo === undefined
        ? null
        : String(linha.referencia_rotulo),
    severidade: lerSeveridade(linha.severidade),
    validadaEm:
      linha.validada_em === null || linha.validada_em === undefined
        ? null
        : new Date(linha.validada_em as string).toISOString(),
  };
}

const COLUNAS_OCORRENCIA = `o.id, o.cultura, o.sintomas, o.latitude, o.longitude, o.confianca, o.status,
  o.autor_email, o.criada_em, o.imagens, o.parcela_id, o.referencia_id, o.severidade, o.validada_em,
  p.nome AS parcela_nome, r.rotulo AS referencia_rotulo`;

const FROM_OCORRENCIA = `ocorrencias o
  LEFT JOIN parcelas p ON p.id = o.parcela_id
  LEFT JOIN referencias_entradas r ON r.id = o.referencia_id`;

function mapearParcela(linha: QueryResultRow): Parcela {
  return {
    id: String(linha.id),
    nome: String(linha.nome),
    latitude: Number(linha.latitude),
    longitude: Number(linha.longitude),
    autorEmail: linha.autor_email === null || linha.autor_email === undefined ? null : String(linha.autor_email),
    criadaEm: new Date(linha.criada_em as string).toISOString(),
  };
}

/** Reutiliza parcela do mesmo autor com o mesmo nome; senão cria (modelo Asset/Location). */
export async function obterOuCriarParcela(entrada: {
  nome: string;
  latitude: number;
  longitude: number;
  autorEmail: string | null;
}): Promise<Parcela> {
  const nome = entrada.nome.trim();
  const ligacao = obterPool();
  if (!ligacao) {
    const existente = parcelasMemoria.find(
      (item) =>
        item.autorEmail === entrada.autorEmail && item.nome.localeCompare(nome, 'pt', { sensitivity: 'accent' }) === 0,
    );
    if (existente) return existente;
    const criada: Parcela = {
      id: randomUUID(),
      nome,
      latitude: entrada.latitude,
      longitude: entrada.longitude,
      autorEmail: entrada.autorEmail,
      criadaEm: new Date().toISOString(),
    };
    parcelasMemoria.push(criada);
    return criada;
  }

  const procura = await ligacao.query(
    `SELECT id, nome, latitude, longitude, autor_email, criada_em FROM parcelas
     WHERE lower(nome) = lower($1) AND (($2::text IS NULL AND autor_email IS NULL) OR autor_email = $2)
     ORDER BY criada_em ASC LIMIT 1`,
    [nome, entrada.autorEmail],
  );
  if (procura.rows[0]) return mapearParcela(procura.rows[0]);

  const id = randomUUID();
  const criadaEm = new Date().toISOString();
  await ligacao.query(
    `INSERT INTO parcelas (id, nome, latitude, longitude, autor_email, criada_em)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, nome, entrada.latitude, entrada.longitude, entrada.autorEmail, criadaEm],
  );
  return {
    id,
    nome,
    latitude: entrada.latitude,
    longitude: entrada.longitude,
    autorEmail: entrada.autorEmail,
    criadaEm,
  };
}

export async function criarOcorrencia(ocorrencia: Ocorrencia): Promise<void> {
  const ligacao = obterPool();
  if (!ligacao) {
    ocorrenciasMemoria.push(ocorrencia);
    return;
  }
  await ligacao.query(
    `INSERT INTO ocorrencias (
      id, cultura, sintomas, latitude, longitude, confianca, status, autor_email, criada_em, imagens,
      parcela_id, referencia_id, severidade, validada_em
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      ocorrencia.id,
      ocorrencia.cultura,
      ocorrencia.sintomas,
      ocorrencia.latitude,
      ocorrencia.longitude,
      ocorrencia.confianca,
      ocorrencia.status,
      ocorrencia.autorEmail,
      ocorrencia.criadaEm,
      ocorrencia.imagens,
      ocorrencia.parcelaId,
      ocorrencia.referenciaId,
      ocorrencia.severidade,
      ocorrencia.validadaEm,
    ],
  );
}

export async function listarOcorrencias(perfil: Perfil, email: string | null): Promise<Ocorrencia[]> {
  const ligacao = obterPool();
  if (!ligacao) {
    if (perfil === 'TECNICO' || email === null) return [...ocorrenciasMemoria];
    return ocorrenciasMemoria.filter((item) => item.autorEmail === email);
  }
  const resultado = await ligacao.query(
    `SELECT ${COLUNAS_OCORRENCIA} FROM ${FROM_OCORRENCIA}
     WHERE $1 = 'TECNICO' OR $2::text IS NULL OR o.autor_email = $2
     ORDER BY o.criada_em ASC`,
    [perfil, email],
  );
  return resultado.rows.map(mapear);
}

export async function obterOcorrencia(id: string): Promise<Ocorrencia | undefined> {
  const ligacao = obterPool();
  if (!ligacao) return ocorrenciasMemoria.find((item) => item.id === id);
  const resultado = await ligacao.query(`SELECT ${COLUNAS_OCORRENCIA} FROM ${FROM_OCORRENCIA} WHERE o.id = $1`, [
    id,
  ]);
  const linha = resultado.rows[0];
  return linha ? mapear(linha) : undefined;
}

export async function ultimaEncaminhada(): Promise<Ocorrencia | undefined> {
  const ligacao = obterPool();
  if (!ligacao) return [...ocorrenciasMemoria].reverse().find((item) => item.status === 'ENCAMINHADA');
  const resultado = await ligacao.query(
    `SELECT ${COLUNAS_OCORRENCIA} FROM ${FROM_OCORRENCIA}
     WHERE o.status = 'ENCAMINHADA' ORDER BY o.criada_em DESC LIMIT 1`,
  );
  const linha = resultado.rows[0];
  return linha ? mapear(linha) : undefined;
}

export async function acrescentarImagem(id: string, nome: string): Promise<void> {
  const ligacao = obterPool();
  if (!ligacao) {
    const alvo = ocorrenciasMemoria.find((item) => item.id === id);
    if (alvo) alvo.imagens.push(nome);
    return;
  }
  await ligacao.query(`UPDATE ocorrencias SET imagens = imagens || ARRAY[$2]::text[] WHERE id = $1`, [id, nome]);
}

export async function marcarValidada(id: string): Promise<void> {
  const agora = new Date().toISOString();
  const ligacao = obterPool();
  if (!ligacao) {
    const alvo = ocorrenciasMemoria.find((item) => item.id === id);
    if (alvo) {
      alvo.status = 'VALIDADA';
      alvo.validadaEm = agora;
    }
    return;
  }
  await ligacao.query(`UPDATE ocorrencias SET status = 'VALIDADA', validada_em = $2 WHERE id = $1`, [
    id,
    agora,
  ]);
}

export async function listarUtilizadores(): Promise<ContaPublica[]> {
  const ligacao = obterPool();
  if (!ligacao) {
    return utilizadoresMemoria
      .map((conta) =>
        mapearContaPublica({
          email: conta.email,
          perfil: conta.perfil,
          nome: conta.nome,
          organizacao: conta.organizacao,
        }),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt') || a.email.localeCompare(b.email));
  }
  const resultado = await ligacao.query(
    `SELECT email, perfil, nome, organizacao FROM utilizadores ORDER BY lower(nome), email`,
  );
  return resultado.rows.map((linha) =>
    mapearContaPublica({
      email: String(linha.email),
      perfil: String(linha.perfil),
      nome: linha.nome === null || linha.nome === undefined ? null : String(linha.nome),
      organizacao: linha.organizacao === null || linha.organizacao === undefined ? null : String(linha.organizacao),
    }),
  );
}

export async function criarUtilizador(conta: Conta): Promise<void> {
  const ligacao = obterPool();
  if (!ligacao) {
    if (utilizadoresMemoria.some((item) => item.email === conta.email)) throw new ContaDuplicada();
    utilizadoresMemoria.push(conta);
    return;
  }
  try {
    await ligacao.query(
      `INSERT INTO utilizadores (email, hash, perfil, nome, organizacao) VALUES ($1, $2, $3, $4, $5)`,
      [conta.email, conta.hash, conta.perfil, conta.nome, conta.organizacao],
    );
  } catch (erro) {
    if (typeof erro === 'object' && erro !== null && 'code' in erro && erro.code === '23505') {
      throw new ContaDuplicada();
    }
    throw erro;
  }
}

export async function actualizarPerfil(email: string, perfil: Perfil): Promise<boolean> {
  const ligacao = obterPool();
  if (!ligacao) {
    const alvo = utilizadoresMemoria.find((conta) => conta.email === email);
    if (!alvo) return false;
    alvo.perfil = perfil;
    return true;
  }
  const resultado = await ligacao.query(`UPDATE utilizadores SET perfil = $2 WHERE email = $1`, [email, perfil]);
  return (resultado.rowCount ?? 0) > 0;
}

export async function procurarUtilizador(email: string): Promise<Conta | undefined> {
  const ligacao = obterPool();
  if (!ligacao) return utilizadoresMemoria.find((conta) => conta.email === email);
  const resultado = await ligacao.query(
    `SELECT email, hash, perfil, nome, organizacao FROM utilizadores WHERE email = $1`,
    [email],
  );
  const linha = resultado.rows[0];
  if (!linha) return undefined;
  const perfil = linha.perfil === 'TECNICO' ? 'TECNICO' : 'AGRICULTOR';
  const nome = String(linha.nome ?? '').trim() || String(linha.email).split('@')[0] || 'Sem nome';
  const organizacao =
    linha.organizacao === null || linha.organizacao === undefined || String(linha.organizacao).trim() === ''
      ? null
      : String(linha.organizacao).trim();
  return {
    email: String(linha.email),
    hash: Buffer.from(linha.hash as Buffer),
    perfil,
    nome,
    organizacao,
  };
}

function nomeDaBase(url: string): string {
  const nome = new URL(url).pathname.replace(/^\//, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nome)) {
    throw new Error('Nome da base de dados inválido');
  }
  return nome;
}

async function garantirBase(url: string): Promise<void> {
  const nome = nomeDaBase(url);
  const administracao = new URL(url);
  administracao.pathname = '/postgres';
  const cliente = new Pool({ connectionString: administracao.toString(), max: 1 });
  try {
    const existe = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [nome]);
    if (existe.rowCount === 0) {
      await cliente.query(`CREATE DATABASE ${nome}`);
    }
  } finally {
    await cliente.end();
  }
}

function pastaReferenciasDisco(): string {
  return path.join(process.cwd(), 'client', 'public', 'referencias');
}

function contentTypePorNome(nome: string): string {
  if (/\.png$/i.test(nome)) return 'image/png';
  if (/\.webp$/i.test(nome)) return 'image/webp';
  return 'image/jpeg';
}

/** Copia o catálogo + JPEGs de client/public/referencias para PostgreSQL. */
async function sincronizarReferencias(ligacao: Pool): Promise<void> {
  const entradas =
    (catalogoReferencias as { entradas?: Array<{ id: string; cultura: string; rotulo: string; cientifico: string | null }> })
      .entradas ?? [];
  if (entradas.length === 0) return;

  const raiz = pastaReferenciasDisco();
  for (const entrada of entradas) {
    await ligacao.query(
      `INSERT INTO referencias_entradas (id, cultura, rotulo, cientifico)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         cultura = EXCLUDED.cultura,
         rotulo = EXCLUDED.rotulo,
         cientifico = EXCLUDED.cientifico`,
      [entrada.id, entrada.cultura, entrada.rotulo, entrada.cientifico],
    );

    let ficheiros: string[] = [];
    try {
      ficheiros = (await readdir(path.join(raiz, entrada.id))).filter((nome) =>
        /\.(jpe?g|png|webp)$/i.test(nome),
      );
    } catch {
      continue;
    }

    for (const nome of ficheiros.sort()) {
      const caminho = path.join(raiz, entrada.id, nome);
      try {
        const info = await stat(caminho);
        if (!info.isFile() || info.size === 0 || info.size > 5 * 1024 * 1024) continue;
        const conteudo = await readFile(caminho);
        await ligacao.query(
          `INSERT INTO referencias_imagens (entrada_id, nome, conteudo, content_type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (entrada_id, nome) DO UPDATE SET
             conteudo = EXCLUDED.conteudo,
             content_type = EXCLUDED.content_type`,
          [entrada.id, nome, conteudo, contentTypePorNome(nome)],
        );
      } catch {
        // Ficheiro ilegível — segue para o próximo.
      }
    }
  }
}

export async function lerImagemReferencia(
  entradaId: string,
  nome: string,
): Promise<{ conteudo: Buffer; contentType: string } | null> {
  if (!/^[a-z0-9-]+$/i.test(entradaId) || !/^[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(nome)) {
    return null;
  }
  const ligacao = obterPool();
  if (!ligacao) return null;
  const resultado = await ligacao.query(
    `SELECT conteudo, content_type FROM referencias_imagens WHERE entrada_id = $1 AND nome = $2`,
    [entradaId, nome],
  );
  const linha = resultado.rows[0];
  if (!linha) return null;
  return {
    conteudo: Buffer.from(linha.conteudo as Buffer),
    contentType: String(linha.content_type || 'image/jpeg'),
  };
}

export async function prepararBase(): Promise<void> {
  const url = urlDaBase();
  if (!url) return;
  await garantirBase(url);
  const ligacao = obterPool();
  if (!ligacao) return;
  await ligacao.query(ESQUEMA);
  await ligacao.query(`ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS imagens text[] NOT NULL DEFAULT '{}'`);
  await ligacao.query(`ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS parcela_id uuid`);
  await ligacao.query(`ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS referencia_id text`);
  await ligacao.query(`ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS severidade smallint`);
  await ligacao.query(`ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS validada_em timestamptz`);
  await ligacao.query(`ALTER TABLE utilizadores ADD COLUMN IF NOT EXISTS nome text NOT NULL DEFAULT ''`);
  await ligacao.query(`ALTER TABLE utilizadores ADD COLUMN IF NOT EXISTS organizacao text`);
  await ligacao.query(
    `INSERT INTO utilizadores (email, hash, perfil, nome, organizacao)
     VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)
     ON CONFLICT (email) DO UPDATE SET
       nome = CASE WHEN utilizadores.nome = '' THEN EXCLUDED.nome ELSE utilizadores.nome END,
       organizacao = COALESCE(utilizadores.organizacao, EXCLUDED.organizacao)`,
    [
      CONTAS_INICIAIS[0].email,
      CONTAS_INICIAIS[0].hash,
      CONTAS_INICIAIS[0].perfil,
      CONTAS_INICIAIS[0].nome,
      CONTAS_INICIAIS[0].organizacao,
      CONTAS_INICIAIS[1].email,
      CONTAS_INICIAIS[1].hash,
      CONTAS_INICIAIS[1].perfil,
      CONTAS_INICIAIS[1].nome,
      CONTAS_INICIAIS[1].organizacao,
    ],
  );
  await sincronizarReferencias(ligacao);
}
