import { randomUUID } from 'crypto';
import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { Pool, type QueryResultRow } from 'pg';
import catalogoReferencias from './biblioteca-referencias.dados.json';
import { CONTAS_INICIAIS, EMAILS_DEMO_REMOVER, type Conta } from './credenciais';
import { ePerfil, podeVerTodasOcorrencias, podeVerTodosPedidosApoio, type Perfil } from './perfis';
import type {
  ContaPublica,
  EstadoOcorrencia,
  AvaliacaoTecnico,
  EstadoPedidoApoio,
  Estrelas,
  EventoOcorrencia,
  MensagemApoio,
  Ocorrencia,
  Parcela,
  PedidoApoio,
  RankingTecnico,
  Severidade,
} from './tipos';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS utilizadores (
  email text PRIMARY KEY,
  hash bytea NOT NULL,
  perfil text NOT NULL,
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
  validada_em timestamptz,
  nota_validacao text,
  validada_por text
);

CREATE TABLE IF NOT EXISTS ocorrencia_eventos (
  id uuid PRIMARY KEY,
  ocorrencia_id uuid NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
  de_status text CHECK (de_status IS NULL OR de_status IN ('TRIADA', 'ENCAMINHADA', 'VALIDADA')),
  para_status text NOT NULL CHECK (para_status IN ('TRIADA', 'ENCAMINHADA', 'VALIDADA')),
  actor_email text,
  nota text,
  criado_em timestamptz NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_ocorrencia_eventos_ocorrencia
  ON ocorrencia_eventos (ocorrencia_id, criado_em ASC);

CREATE TABLE IF NOT EXISTS pedidos_apoio (
  id uuid PRIMARY KEY,
  assunto text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO')),
  autor_email text NOT NULL,
  tecnico_email text,
  ocorrencia_id uuid REFERENCES ocorrencias(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL,
  actualizado_em timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pedido_mensagens (
  id uuid PRIMARY KEY,
  pedido_id uuid NOT NULL REFERENCES pedidos_apoio(id) ON DELETE CASCADE,
  autor_email text NOT NULL,
  corpo text NOT NULL,
  criado_em timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedidos_apoio_autor
  ON pedidos_apoio (autor_email, actualizado_em DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_apoio_estado
  ON pedidos_apoio (estado, actualizado_em DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_mensagens_pedido
  ON pedido_mensagens (pedido_id, criado_em ASC);

CREATE TABLE IF NOT EXISTS avaliacoes_tecnicos (
  id uuid PRIMARY KEY,
  pedido_id uuid NOT NULL UNIQUE REFERENCES pedidos_apoio(id) ON DELETE CASCADE,
  tecnico_email text NOT NULL,
  autor_email text NOT NULL,
  estrelas smallint NOT NULL CHECK (estrelas BETWEEN 1 AND 5),
  comentario text,
  criado_em timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_tecnicos_tecnico
  ON avaliacoes_tecnicos (tecnico_email, criado_em DESC);
`;

const ocorrenciasMemoria: Ocorrencia[] = [];
const parcelasMemoria: Parcela[] = [];
const eventosMemoria: EventoOcorrencia[] = [];
const pedidosMemoria: PedidoApoio[] = [];
const mensagensApoioMemoria: MensagemApoio[] = [];
const avaliacoesMemoria: AvaliacaoTecnico[] = [];

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
    // Render Postgres exige TLS; em local o URL costuma ser sem SSL.
    const precisaSsl =
      process.env.PGSSLMODE === 'require' ||
      /render\.com|sslmode=require/i.test(url) ||
      process.env.NODE_ENV === 'production';
    pool = new Pool({
      connectionString: url,
      max: 10,
      ssl: precisaSsl ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', () => {
      console.error('Ligação PostgreSQL interrompida');
    });
  }
  return pool;
}

export function reporEstado(): void {
  ocorrenciasMemoria.length = 0;
  parcelasMemoria.length = 0;
  eventosMemoria.length = 0;
  pedidosMemoria.length = 0;
  mensagensApoioMemoria.length = 0;
  avaliacoesMemoria.length = 0;
  utilizadoresMemoria = copiarContas();
}

function mapearPedido(linha: QueryResultRow): PedidoApoio {
  return {
    id: String(linha.id),
    assunto: String(linha.assunto),
    estado: String(linha.estado) as EstadoPedidoApoio,
    autorEmail: String(linha.autor_email),
    tecnicoEmail: linha.tecnico_email == null ? null : String(linha.tecnico_email),
    ocorrenciaId: linha.ocorrencia_id == null ? null : String(linha.ocorrencia_id),
    criadoEm: new Date(linha.criado_em as string | Date).toISOString(),
    actualizadoEm: new Date(linha.actualizado_em as string | Date).toISOString(),
    preview: linha.preview == null ? null : String(linha.preview),
  };
}

function mapearMensagemApoio(linha: QueryResultRow): MensagemApoio {
  return {
    id: String(linha.id),
    pedidoId: String(linha.pedido_id),
    autorEmail: String(linha.autor_email),
    corpo: String(linha.corpo),
    criadoEm: new Date(linha.criado_em as string | Date).toISOString(),
  };
}

function mapearAvaliacao(linha: QueryResultRow): AvaliacaoTecnico {
  return {
    id: String(linha.id),
    pedidoId: String(linha.pedido_id),
    tecnicoEmail: String(linha.tecnico_email),
    autorEmail: String(linha.autor_email),
    estrelas: Number(linha.estrelas) as Estrelas,
    comentario: linha.comentario == null || String(linha.comentario).trim() === ''
      ? null
      : String(linha.comentario),
    criadoEm: new Date(linha.criado_em as string | Date).toISOString(),
  };
}

async function obterAvaliacaoDoPedido(pedidoId: string): Promise<AvaliacaoTecnico | null> {
  const ligacao = obterPool();
  if (!ligacao) {
    return avaliacoesMemoria.find((item) => item.pedidoId === pedidoId) ?? null;
  }
  const resultado = await ligacao.query(
    `SELECT * FROM avaliacoes_tecnicos WHERE pedido_id = $1 LIMIT 1`,
    [pedidoId],
  );
  const linha = resultado.rows[0];
  return linha ? mapearAvaliacao(linha) : null;
}

function mapearContaPublica(linha: {
  email: string;
  perfil: string;
  nome?: string | null;
  organizacao?: string | null;
}): ContaPublica {
  const perfilBruto = String(linha.perfil);
  const perfil: Perfil = ePerfil(perfilBruto) ? perfilBruto : 'AGRICULTOR';
  return {
    email: String(linha.email),
    perfil,
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
    notaValidacao:
      linha.nota_validacao === null || linha.nota_validacao === undefined
        ? null
        : String(linha.nota_validacao),
    validadaPor:
      linha.validada_por === null || linha.validada_por === undefined ? null : String(linha.validada_por),
  };
}

function mapearEvento(linha: QueryResultRow): EventoOcorrencia {
  return {
    id: String(linha.id),
    ocorrenciaId: String(linha.ocorrencia_id),
    deStatus:
      linha.de_status === null || linha.de_status === undefined
        ? null
        : (String(linha.de_status) as EstadoOcorrencia),
    paraStatus: String(linha.para_status) as EstadoOcorrencia,
    actorEmail: linha.actor_email === null || linha.actor_email === undefined ? null : String(linha.actor_email),
    nota: linha.nota === null || linha.nota === undefined ? null : String(linha.nota),
    criadoEm: new Date(linha.criado_em as string).toISOString(),
  };
}

const COLUNAS_OCORRENCIA = `o.id, o.cultura, o.sintomas, o.latitude, o.longitude, o.confianca, o.status,
  o.autor_email, o.criada_em, o.imagens, o.parcela_id, o.referencia_id, o.severidade, o.validada_em,
  o.nota_validacao, o.validada_por,
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

async function registarEvento(entrada: {
  ocorrenciaId: string;
  deStatus: EstadoOcorrencia | null;
  paraStatus: EstadoOcorrencia;
  actorEmail: string | null;
  nota: string | null;
  criadoEm?: string;
}): Promise<EventoOcorrencia> {
  const evento: EventoOcorrencia = {
    id: randomUUID(),
    ocorrenciaId: entrada.ocorrenciaId,
    deStatus: entrada.deStatus,
    paraStatus: entrada.paraStatus,
    actorEmail: entrada.actorEmail,
    nota: entrada.nota,
    criadoEm: entrada.criadoEm ?? new Date().toISOString(),
  };
  const ligacao = obterPool();
  if (!ligacao) {
    eventosMemoria.push(evento);
    return evento;
  }
  await ligacao.query(
    `INSERT INTO ocorrencia_eventos (id, ocorrencia_id, de_status, para_status, actor_email, nota, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      evento.id,
      evento.ocorrenciaId,
      evento.deStatus,
      evento.paraStatus,
      evento.actorEmail,
      evento.nota,
      evento.criadoEm,
    ],
  );
  return evento;
}

export async function listarHistoricoOcorrencia(ocorrenciaId: string): Promise<EventoOcorrencia[]> {
  const ligacao = obterPool();
  if (!ligacao) {
    return eventosMemoria
      .filter((item) => item.ocorrenciaId === ocorrenciaId)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }
  const resultado = await ligacao.query(
    `SELECT id, ocorrencia_id, de_status, para_status, actor_email, nota, criado_em
     FROM ocorrencia_eventos
     WHERE ocorrencia_id = $1
     ORDER BY criado_em ASC`,
    [ocorrenciaId],
  );
  return resultado.rows.map(mapearEvento);
}

export async function criarOcorrencia(ocorrencia: Ocorrencia): Promise<void> {
  const ligacao = obterPool();
  if (!ligacao) {
    ocorrenciasMemoria.push(ocorrencia);
    await registarEvento({
      ocorrenciaId: ocorrencia.id,
      deStatus: null,
      paraStatus: ocorrencia.status,
      actorEmail: ocorrencia.autorEmail,
      nota: null,
      criadoEm: ocorrencia.criadaEm,
    });
    return;
  }
  await ligacao.query(
    `INSERT INTO ocorrencias (
      id, cultura, sintomas, latitude, longitude, confianca, status, autor_email, criada_em, imagens,
      parcela_id, referencia_id, severidade, validada_em, nota_validacao, validada_por
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
      ocorrencia.notaValidacao,
      ocorrencia.validadaPor,
    ],
  );
  await registarEvento({
    ocorrenciaId: ocorrencia.id,
    deStatus: null,
    paraStatus: ocorrencia.status,
    actorEmail: ocorrencia.autorEmail,
    nota: null,
    criadoEm: ocorrencia.criadaEm,
  });
}

export async function listarOcorrencias(perfil: Perfil, email: string | null): Promise<Ocorrencia[]> {
  const ligacao = obterPool();
  // Nunca promover "sem email" a visão global — só o perfil autoriza.
  const verTodas = podeVerTodasOcorrencias(perfil);
  if (!ligacao) {
    if (verTodas) return [...ocorrenciasMemoria];
    return ocorrenciasMemoria.filter((item) => item.autorEmail === email);
  }
  if (verTodas) {
    const resultado = await ligacao.query(
      `SELECT ${COLUNAS_OCORRENCIA} FROM ${FROM_OCORRENCIA} ORDER BY o.criada_em ASC`,
    );
    return resultado.rows.map(mapear);
  }
  const resultado = await ligacao.query(
    `SELECT ${COLUNAS_OCORRENCIA} FROM ${FROM_OCORRENCIA}
     WHERE o.autor_email = $1
     ORDER BY o.criada_em ASC`,
    [email],
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

export async function marcarValidada(
  id: string,
  opcoes: { nota: string; validadaPor: string | null },
): Promise<Ocorrencia | undefined> {
  const agora = new Date().toISOString();
  const nota = opcoes.nota.trim();
  const ligacao = obterPool();
  if (!ligacao) {
    const alvo = ocorrenciasMemoria.find((item) => item.id === id);
    if (!alvo) return undefined;
    const deStatus = alvo.status;
    alvo.status = 'VALIDADA';
    alvo.validadaEm = agora;
    alvo.notaValidacao = nota;
    alvo.validadaPor = opcoes.validadaPor;
    await registarEvento({
      ocorrenciaId: id,
      deStatus,
      paraStatus: 'VALIDADA',
      actorEmail: opcoes.validadaPor,
      nota,
      criadoEm: agora,
    });
    return { ...alvo };
  }
  await ligacao.query(
    `UPDATE ocorrencias
     SET status = 'VALIDADA', validada_em = $2, nota_validacao = $3, validada_por = $4
     WHERE id = $1`,
    [id, agora, nota, opcoes.validadaPor],
  );
  await registarEvento({
    ocorrenciaId: id,
    deStatus: 'ENCAMINHADA',
    paraStatus: 'VALIDADA',
    actorEmail: opcoes.validadaPor,
    nota,
    criadoEm: agora,
  });
  return obterOcorrencia(id);
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

export async function actualizarSenha(email: string, hash: Buffer): Promise<boolean> {
  const ligacao = obterPool();
  if (!ligacao) {
    const alvo = utilizadoresMemoria.find((conta) => conta.email === email);
    if (!alvo) return false;
    alvo.hash = Buffer.from(hash);
    return true;
  }
  const resultado = await ligacao.query(`UPDATE utilizadores SET hash = $2 WHERE email = $1`, [email, hash]);
  return (resultado.rowCount ?? 0) > 0;
}

export async function actualizarTitular(
  email: string,
  dados: { nome: string; organizacao: string | null },
): Promise<boolean> {
  const ligacao = obterPool();
  if (!ligacao) {
    const alvo = utilizadoresMemoria.find((conta) => conta.email === email);
    if (!alvo) return false;
    alvo.nome = dados.nome;
    alvo.organizacao = dados.organizacao;
    return true;
  }
  const resultado = await ligacao.query(
    `UPDATE utilizadores SET nome = $2, organizacao = $3 WHERE email = $1`,
    [email, dados.nome, dados.organizacao],
  );
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
  const perfilBruto = String(linha.perfil);
  const perfil: Perfil = ePerfil(perfilBruto) ? perfilBruto : 'AGRICULTOR';
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

export async function criarPedidoApoio(entrada: {
  assunto: string;
  autorEmail: string;
  ocorrenciaId: string | null;
  mensagem: string;
}): Promise<PedidoApoio> {
  const agora = new Date().toISOString();
  const pedidoId = randomUUID();
  const mensagemId = randomUUID();
  const pedido: PedidoApoio = {
    id: pedidoId,
    assunto: entrada.assunto,
    estado: 'ABERTO',
    autorEmail: entrada.autorEmail,
    tecnicoEmail: null,
    ocorrenciaId: entrada.ocorrenciaId,
    criadoEm: agora,
    actualizadoEm: agora,
    preview: entrada.mensagem,
  };
  const mensagem: MensagemApoio = {
    id: mensagemId,
    pedidoId,
    autorEmail: entrada.autorEmail,
    corpo: entrada.mensagem,
    criadoEm: agora,
  };

  const ligacao = obterPool();
  if (!ligacao) {
    pedidosMemoria.push(pedido);
    mensagensApoioMemoria.push(mensagem);
    return { ...pedido, mensagens: [mensagem] };
  }

  await ligacao.query(
    `INSERT INTO pedidos_apoio
      (id, assunto, estado, autor_email, tecnico_email, ocorrencia_id, criado_em, actualizado_em)
     VALUES ($1, $2, 'ABERTO', $3, NULL, $4, $5, $5)`,
    [pedidoId, entrada.assunto, entrada.autorEmail, entrada.ocorrenciaId, agora],
  );
  await ligacao.query(
    `INSERT INTO pedido_mensagens (id, pedido_id, autor_email, corpo, criado_em)
     VALUES ($1, $2, $3, $4, $5)`,
    [mensagemId, pedidoId, entrada.autorEmail, entrada.mensagem, agora],
  );
  return { ...pedido, mensagens: [mensagem] };
}

export async function listarPedidosApoio(perfil: Perfil, email: string | null): Promise<PedidoApoio[]> {
  const verTodos = podeVerTodosPedidosApoio(perfil);
  const ligacao = obterPool();
  if (!ligacao) {
    const base = verTodos
      ? [...pedidosMemoria]
      : pedidosMemoria.filter((item) => item.autorEmail === email);
    return base
      .map((pedido) => {
        const ultima = [...mensagensApoioMemoria]
          .filter((mensagem) => mensagem.pedidoId === pedido.id)
          .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
          .at(-1);
        return { ...pedido, preview: ultima?.corpo ?? pedido.preview ?? null };
      })
      .sort((a, b) => b.actualizadoEm.localeCompare(a.actualizadoEm));
  }

  const resultado = verTodos
    ? await ligacao.query(
        `SELECT p.*, (
           SELECT m.corpo FROM pedido_mensagens m
           WHERE m.pedido_id = p.id
           ORDER BY m.criado_em DESC LIMIT 1
         ) AS preview
         FROM pedidos_apoio p
         ORDER BY p.actualizado_em DESC`,
      )
    : await ligacao.query(
        `SELECT p.*, (
           SELECT m.corpo FROM pedido_mensagens m
           WHERE m.pedido_id = p.id
           ORDER BY m.criado_em DESC LIMIT 1
         ) AS preview
         FROM pedidos_apoio p
         WHERE p.autor_email = $1
         ORDER BY p.actualizado_em DESC`,
        [email],
      );
  return resultado.rows.map(mapearPedido);
}

export async function obterPedidoApoio(id: string): Promise<PedidoApoio | null> {
  const ligacao = obterPool();
  if (!ligacao) {
    const pedido = pedidosMemoria.find((item) => item.id === id);
    if (!pedido) return null;
    const mensagens = mensagensApoioMemoria
      .filter((mensagem) => mensagem.pedidoId === id)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
    const avaliacao = await obterAvaliacaoDoPedido(id);
    return { ...pedido, mensagens, preview: mensagens.at(-1)?.corpo ?? null, avaliacao };
  }

  const resultado = await ligacao.query(`SELECT * FROM pedidos_apoio WHERE id = $1`, [id]);
  const linha = resultado.rows[0];
  if (!linha) return null;
  const mensagens = await ligacao.query(
    `SELECT * FROM pedido_mensagens WHERE pedido_id = $1 ORDER BY criado_em ASC`,
    [id],
  );
  const pedido = mapearPedido(linha);
  const lista = mensagens.rows.map(mapearMensagemApoio);
  const avaliacao = await obterAvaliacaoDoPedido(id);
  return { ...pedido, mensagens: lista, preview: lista.at(-1)?.corpo ?? null, avaliacao };
}

export async function criarAvaliacaoTecnico(entrada: {
  pedidoId: string;
  tecnicoEmail: string;
  autorEmail: string;
  estrelas: Estrelas;
  comentario: string | null;
}): Promise<AvaliacaoTecnico> {
  const agora = new Date().toISOString();
  const avaliacao: AvaliacaoTecnico = {
    id: randomUUID(),
    pedidoId: entrada.pedidoId,
    tecnicoEmail: entrada.tecnicoEmail,
    autorEmail: entrada.autorEmail,
    estrelas: entrada.estrelas,
    comentario: entrada.comentario,
    criadoEm: agora,
  };

  const ligacao = obterPool();
  if (!ligacao) {
    if (avaliacoesMemoria.some((item) => item.pedidoId === entrada.pedidoId)) {
      throw new Error('Pedido já avaliado');
    }
    avaliacoesMemoria.push(avaliacao);
    return avaliacao;
  }

  try {
    await ligacao.query(
      `INSERT INTO avaliacoes_tecnicos
        (id, pedido_id, tecnico_email, autor_email, estrelas, comentario, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        avaliacao.id,
        entrada.pedidoId,
        entrada.tecnicoEmail,
        entrada.autorEmail,
        entrada.estrelas,
        entrada.comentario,
        agora,
      ],
    );
  } catch (erro) {
    const codigo = typeof erro === 'object' && erro && 'code' in erro ? String((erro as { code: unknown }).code) : '';
    if (codigo === '23505') throw new Error('Pedido já avaliado');
    throw erro;
  }
  return avaliacao;
}

export async function listarRankingTecnicos(): Promise<RankingTecnico[]> {
  const ligacao = obterPool();
  if (!ligacao) {
    const porEmail = new Map<string, { soma: number; total: number }>();
    for (const item of avaliacoesMemoria) {
      const actual = porEmail.get(item.tecnicoEmail) ?? { soma: 0, total: 0 };
      actual.soma += item.estrelas;
      actual.total += 1;
      porEmail.set(item.tecnicoEmail, actual);
    }
    return [...porEmail.entries()]
      .map(([email, stats]) => {
        const conta = utilizadoresMemoria.find((item) => item.email === email);
        return {
          email,
          nome: conta?.nome?.trim() || email.split('@')[0] || email,
          media: Number((stats.soma / stats.total).toFixed(2)),
          total: stats.total,
        };
      })
      .sort((a, b) => b.media - a.media || b.total - a.total);
  }

  const resultado = await ligacao.query(
    `SELECT
       a.tecnico_email AS email,
       COALESCE(NULLIF(TRIM(u.nome), ''), split_part(a.tecnico_email, '@', 1)) AS nome,
       ROUND(AVG(a.estrelas)::numeric, 2) AS media,
       COUNT(*)::int AS total
     FROM avaliacoes_tecnicos a
     LEFT JOIN utilizadores u ON u.email = a.tecnico_email
     GROUP BY a.tecnico_email, u.nome
     ORDER BY media DESC, total DESC, nome ASC`,
  );
  return resultado.rows.map((linha) => ({
    email: String(linha.email),
    nome: String(linha.nome),
    media: Number(linha.media),
    total: Number(linha.total),
  }));
}

export async function adicionarMensagemApoio(entrada: {
  pedidoId: string;
  autorEmail: string;
  corpo: string;
  estado?: EstadoPedidoApoio;
  tecnicoEmail?: string | null;
}): Promise<PedidoApoio | null> {
  const agora = new Date().toISOString();
  const mensagem: MensagemApoio = {
    id: randomUUID(),
    pedidoId: entrada.pedidoId,
    autorEmail: entrada.autorEmail,
    corpo: entrada.corpo,
    criadoEm: agora,
  };

  const ligacao = obterPool();
  if (!ligacao) {
    const pedido = pedidosMemoria.find((item) => item.id === entrada.pedidoId);
    if (!pedido) return null;
    mensagensApoioMemoria.push(mensagem);
    pedido.actualizadoEm = agora;
    if (entrada.estado) pedido.estado = entrada.estado;
    if (entrada.tecnicoEmail !== undefined) pedido.tecnicoEmail = entrada.tecnicoEmail;
    pedido.preview = entrada.corpo;
    const mensagens = mensagensApoioMemoria
      .filter((item) => item.pedidoId === pedido.id)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
    return { ...pedido, mensagens };
  }

  const actual = await ligacao.query(`SELECT id FROM pedidos_apoio WHERE id = $1`, [entrada.pedidoId]);
  if (!actual.rows[0]) return null;

  await ligacao.query(
    `INSERT INTO pedido_mensagens (id, pedido_id, autor_email, corpo, criado_em)
     VALUES ($1, $2, $3, $4, $5)`,
    [mensagem.id, entrada.pedidoId, entrada.autorEmail, entrada.corpo, agora],
  );
  await ligacao.query(
    `UPDATE pedidos_apoio
     SET actualizado_em = $2,
         estado = COALESCE($3, estado),
         tecnico_email = COALESCE($4, tecnico_email)
     WHERE id = $1`,
    [entrada.pedidoId, agora, entrada.estado ?? null, entrada.tecnicoEmail ?? null],
  );
  return obterPedidoApoio(entrada.pedidoId);
}

export async function actualizarEstadoPedidoApoio(
  id: string,
  estado: EstadoPedidoApoio,
  tecnicoEmail?: string | null,
): Promise<PedidoApoio | null> {
  const agora = new Date().toISOString();
  const ligacao = obterPool();
  if (!ligacao) {
    const pedido = pedidosMemoria.find((item) => item.id === id);
    if (!pedido) return null;
    pedido.estado = estado;
    pedido.actualizadoEm = agora;
    if (tecnicoEmail !== undefined) pedido.tecnicoEmail = tecnicoEmail;
    return obterPedidoApoio(id);
  }

  const resultado = await ligacao.query(
    `UPDATE pedidos_apoio
     SET estado = $2,
         actualizado_em = $3,
         tecnico_email = COALESCE($4, tecnico_email)
     WHERE id = $1
     RETURNING id`,
    [id, estado, agora, tecnicoEmail ?? null],
  );
  if (!resultado.rows[0]) return null;
  return obterPedidoApoio(id);
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
  await ligacao.query(`ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS nota_validacao text`);
  await ligacao.query(`ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS validada_por text`);
  await ligacao.query(`
    CREATE TABLE IF NOT EXISTS ocorrencia_eventos (
      id uuid PRIMARY KEY,
      ocorrencia_id uuid NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
      de_status text CHECK (de_status IS NULL OR de_status IN ('TRIADA', 'ENCAMINHADA', 'VALIDADA')),
      para_status text NOT NULL CHECK (para_status IN ('TRIADA', 'ENCAMINHADA', 'VALIDADA')),
      actor_email text,
      nota text,
      criado_em timestamptz NOT NULL
    )`);
  await ligacao.query(
    `CREATE INDEX IF NOT EXISTS idx_ocorrencia_eventos_ocorrencia ON ocorrencia_eventos (ocorrencia_id, criado_em ASC)`,
  );
  await ligacao.query(`
    CREATE TABLE IF NOT EXISTS pedidos_apoio (
      id uuid PRIMARY KEY,
      assunto text NOT NULL,
      estado text NOT NULL CHECK (estado IN ('ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO')),
      autor_email text NOT NULL,
      tecnico_email text,
      ocorrencia_id uuid REFERENCES ocorrencias(id) ON DELETE SET NULL,
      criado_em timestamptz NOT NULL,
      actualizado_em timestamptz NOT NULL
    )`);
  await ligacao.query(`
    CREATE TABLE IF NOT EXISTS pedido_mensagens (
      id uuid PRIMARY KEY,
      pedido_id uuid NOT NULL REFERENCES pedidos_apoio(id) ON DELETE CASCADE,
      autor_email text NOT NULL,
      corpo text NOT NULL,
      criado_em timestamptz NOT NULL
    )`);
  await ligacao.query(
    `CREATE INDEX IF NOT EXISTS idx_pedidos_apoio_autor ON pedidos_apoio (autor_email, actualizado_em DESC)`,
  );
  await ligacao.query(
    `CREATE INDEX IF NOT EXISTS idx_pedidos_apoio_estado ON pedidos_apoio (estado, actualizado_em DESC)`,
  );
  await ligacao.query(
    `CREATE INDEX IF NOT EXISTS idx_pedido_mensagens_pedido ON pedido_mensagens (pedido_id, criado_em ASC)`,
  );
  await ligacao.query(`
    CREATE TABLE IF NOT EXISTS avaliacoes_tecnicos (
      id uuid PRIMARY KEY,
      pedido_id uuid NOT NULL UNIQUE REFERENCES pedidos_apoio(id) ON DELETE CASCADE,
      tecnico_email text NOT NULL,
      autor_email text NOT NULL,
      estrelas smallint NOT NULL CHECK (estrelas BETWEEN 1 AND 5),
      comentario text,
      criado_em timestamptz NOT NULL
    )`);
  await ligacao.query(
    `CREATE INDEX IF NOT EXISTS idx_avaliacoes_tecnicos_tecnico ON avaliacoes_tecnicos (tecnico_email, criado_em DESC)`,
  );
  await ligacao.query(`ALTER TABLE utilizadores ADD COLUMN IF NOT EXISTS nome text NOT NULL DEFAULT ''`);
  await ligacao.query(`ALTER TABLE utilizadores ADD COLUMN IF NOT EXISTS organizacao text`);
  await ligacao.query(`ALTER TABLE utilizadores DROP CONSTRAINT IF EXISTS utilizadores_perfil_check`);
  if (EMAILS_DEMO_REMOVER.length > 0) {
    await ligacao.query(`DELETE FROM utilizadores WHERE email = ANY($1::text[])`, [EMAILS_DEMO_REMOVER]);
  }
  for (const conta of CONTAS_INICIAIS) {
    await ligacao.query(
      `INSERT INTO utilizadores (email, hash, perfil, nome, organizacao)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         perfil = EXCLUDED.perfil`,
      [conta.email, conta.hash, conta.perfil, conta.nome, conta.organizacao],
    );
  }
  await sincronizarReferencias(ligacao);
}
