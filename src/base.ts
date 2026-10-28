import { Pool, type QueryResultRow } from 'pg';
import { CONTAS_INICIAIS, type Conta } from './credenciais';
import type { Ocorrencia, Perfil } from './tipos';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS utilizadores (
  email text PRIMARY KEY,
  hash bytea NOT NULL,
  perfil text NOT NULL CHECK (perfil IN ('AGRICULTOR', 'TECNICO'))
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
  criada_em timestamptz NOT NULL
);
`;

const ocorrenciasMemoria: Ocorrencia[] = [];

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
  };
}

const COLUNAS = `id, cultura, sintomas, latitude, longitude, confianca, status, autor_email, criada_em`;

export async function criarOcorrencia(ocorrencia: Ocorrencia): Promise<void> {
  const ligacao = obterPool();
  if (!ligacao) {
    ocorrenciasMemoria.push(ocorrencia);
    return;
  }
  await ligacao.query(
    `INSERT INTO ocorrencias (${COLUNAS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
    `SELECT ${COLUNAS} FROM ocorrencias
     WHERE $1 = 'TECNICO' OR $2::text IS NULL OR autor_email = $2
     ORDER BY criada_em ASC`,
    [perfil, email],
  );
  return resultado.rows.map(mapear);
}

export async function obterOcorrencia(id: string): Promise<Ocorrencia | undefined> {
  const ligacao = obterPool();
  if (!ligacao) return ocorrenciasMemoria.find((item) => item.id === id);
  const resultado = await ligacao.query(`SELECT ${COLUNAS} FROM ocorrencias WHERE id = $1`, [id]);
  const linha = resultado.rows[0];
  return linha ? mapear(linha) : undefined;
}

export async function ultimaEncaminhada(): Promise<Ocorrencia | undefined> {
  const ligacao = obterPool();
  if (!ligacao) return [...ocorrenciasMemoria].reverse().find((item) => item.status === 'ENCAMINHADA');
  const resultado = await ligacao.query(
    `SELECT ${COLUNAS} FROM ocorrencias WHERE status = 'ENCAMINHADA' ORDER BY criada_em DESC LIMIT 1`,
  );
  const linha = resultado.rows[0];
  return linha ? mapear(linha) : undefined;
}

export async function marcarValidada(id: string): Promise<void> {
  const ligacao = obterPool();
  if (!ligacao) {
    const alvo = ocorrenciasMemoria.find((item) => item.id === id);
    if (alvo) alvo.status = 'VALIDADA';
    return;
  }
  await ligacao.query(`UPDATE ocorrencias SET status = 'VALIDADA' WHERE id = $1`, [id]);
}

export async function procurarUtilizador(email: string): Promise<Conta | undefined> {
  const ligacao = obterPool();
  if (!ligacao) return CONTAS_INICIAIS.find((conta) => conta.email === email);
  const resultado = await ligacao.query(
    `SELECT email, hash, perfil FROM utilizadores WHERE email = $1`,
    [email],
  );
  const linha = resultado.rows[0];
  if (!linha) return undefined;
  const perfil = linha.perfil === 'TECNICO' ? 'TECNICO' : 'AGRICULTOR';
  return { email: String(linha.email), hash: Buffer.from(linha.hash as Buffer), perfil };
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

export async function prepararBase(): Promise<void> {
  const url = urlDaBase();
  if (!url) return;
  await garantirBase(url);
  const ligacao = obterPool();
  if (!ligacao) return;
  await ligacao.query(ESQUEMA);
  await ligacao.query(
    `INSERT INTO utilizadores (email, hash, perfil)
     VALUES ($1, $2, $3), ($4, $5, $6)
     ON CONFLICT (email) DO NOTHING`,
    [
      CONTAS_INICIAIS[0].email,
      CONTAS_INICIAIS[0].hash,
      CONTAS_INICIAIS[0].perfil,
      CONTAS_INICIAIS[1].email,
      CONTAS_INICIAIS[1].hash,
      CONTAS_INICIAIS[1].perfil,
    ],
  );
}
