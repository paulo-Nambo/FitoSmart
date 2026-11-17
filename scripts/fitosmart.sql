-- FitoSmart — esquema PostgreSQL
-- Uso (psql):
--   psql -U postgres -f scripts/fitosmart.sql
-- Ou, se a base já existir:
--   psql -U postgres -d fitosmart -f scripts/fitosmart.sql
--
-- A app também cria/actualiza o esquema ao arrancar (prepararBase)
-- quando DATABASE_URL está definido. As imagens de referência
-- (bytea) são sincronizadas a partir de client/public/referencias.

\set ON_ERROR_STOP on

SELECT 'A criar a base fitosmart (se ainda não existir)…' AS info;

SELECT 'CREATE DATABASE fitosmart'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fitosmart')\gexec

\connect fitosmart

BEGIN;

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

ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS imagens text[] NOT NULL DEFAULT '{}';
ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS parcela_id uuid;
ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS referencia_id text;
ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS severidade smallint;
ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS validada_em timestamptz;
ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS nota_validacao text;
ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS validada_por text;
ALTER TABLE utilizadores
  ADD COLUMN IF NOT EXISTS nome text NOT NULL DEFAULT '';
ALTER TABLE utilizadores
  ADD COLUMN IF NOT EXISTS organizacao text;
ALTER TABLE utilizadores DROP CONSTRAINT IF EXISTS utilizadores_perfil_check;

CREATE INDEX IF NOT EXISTS idx_ocorrencias_status
  ON ocorrencias (status);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_autor
  ON ocorrencias (autor_email);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_criada_em
  ON ocorrencias (criada_em DESC);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_parcela
  ON ocorrencias (parcela_id);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_referencia
  ON ocorrencias (referencia_id);

CREATE INDEX IF NOT EXISTS idx_ocorrencia_eventos_ocorrencia
  ON ocorrencia_eventos (ocorrencia_id, criado_em ASC);

CREATE INDEX IF NOT EXISTS idx_parcelas_autor_nome
  ON parcelas (autor_email, lower(nome));

CREATE INDEX IF NOT EXISTS idx_referencias_imagens_entrada
  ON referencias_imagens (entrada_id);

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

-- Remover contas de demonstração antigas
DELETE FROM utilizadores WHERE email IN (
  'agricultor@uem.mz',
  'tecnico@uem.mz',
  'gestor@uem.mz',
  'visualizador@uem.mz',
  'admin.contas@uem.mz',
  'admin.config@uem.mz'
);

-- Administrador do sistema (senha: FitoSmart1!, scrypt + sal "fitosmart-demo")
-- Nota: o arranque da app não repõe o hash se a conta já existir.
INSERT INTO utilizadores (email, hash, perfil, nome, organizacao) VALUES
  ('paulo.baltazar@uem.mz', decode('dfbb0ae949cba0870ec6c19c4409203367d1f69bf8fbb85d673522565f9dd0c4', 'hex'), 'ADMIN_SISTEMA', 'Paulo Baltazar', 'UEM · FitoSmart')
ON CONFLICT (email) DO UPDATE SET
  perfil = EXCLUDED.perfil;

-- Metadados do catálogo de referência (os JPEG vão para bytea via a API / npm run referencias + arranque)
INSERT INTO referencias_entradas (id, cultura, rotulo, cientifico) VALUES
  ('feijao-antracnose', 'Feijão', 'Antracnose do feijão', 'Colletotrichum lindemuthianum'),
  ('feijao-ferrugem', 'Feijão', 'Ferrugem do feijão', 'Uromyces appendiculatus'),
  ('feijao-mancha-angular', 'Feijão', 'Mancha angular do feijão', 'Pseudocercospora griseola'),
  ('mandioca-estria', 'Mandioca', 'Estría castanha da mandioca', 'Cassava brown streak virus'),
  ('mandioca-mosaico', 'Mandioca', 'Mosaico da mandioca', 'Cassava mosaic virus'),
  ('milho-ferrugem', 'Milho', 'Ferrugem do milho', 'Puccinia sorghi'),
  ('milho-lagarta-cartucho', 'Milho', 'Lagarta-do-cartucho', 'Spodoptera frugiperda'),
  ('milho-queima-foliar', 'Milho', 'Queima foliar do milho', 'Exserohilum turcicum'),
  ('milho-riscado', 'Milho', 'Vírus do riscado do milho', 'Maize streak virus'),
  ('tomate-acaro', 'Tomate', 'Ácaro-rajado', 'Tetranychus urticae'),
  ('tomate-alternaria', 'Tomate', 'Alternária / pinta-preta', 'Alternaria solani'),
  ('tomate-enrolamento', 'Tomate', 'Vírus do enrolamento amarelo', 'Tomato yellow leaf curl virus'),
  ('tomate-mildio', 'Tomate', 'Míldio do tomateiro', 'Phytophthora infestans'),
  ('tomate-tuta', 'Tomate', 'Traça-do-tomateiro', 'Tuta absoluta')
ON CONFLICT (id) DO UPDATE SET
  cultura = EXCLUDED.cultura,
  rotulo = EXCLUDED.rotulo,
  cientifico = EXCLUDED.cientifico;

COMMIT;

SELECT 'Esquema FitoSmart pronto.' AS info;
SELECT
  (SELECT COUNT(*) FROM utilizadores) AS utilizadores,
  (SELECT COUNT(*) FROM parcelas) AS parcelas,
  (SELECT COUNT(*) FROM ocorrencias) AS ocorrencias,
  (SELECT COUNT(*) FROM referencias_entradas) AS referencias_entradas,
  (SELECT COUNT(*) FROM referencias_imagens) AS referencias_imagens;
