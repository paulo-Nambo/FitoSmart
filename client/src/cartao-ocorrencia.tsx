import { memo, useEffect, useState, type ReactNode } from 'react';
import { obterImagem, urlDaImagem, type Ocorrencia } from './api';
import { HistoricoOcorrencia } from './historico-ocorrencia';

const ROTULOS_SINTOMA: Record<string, string> = {
  manchas_amarelas: 'Manchas amarelas',
  folhas_secas: 'Folhas secas',
  murcha: 'Murcha',
  pragas_visiveis: 'Pragas visíveis',
};

const ROTULOS_SEVERIDADE: Record<number, string> = {
  1: 'Muito baixa',
  2: 'Baixa',
  3: 'Moderada',
  4: 'Alta',
  5: 'Crítica',
};

export function rotuloSeveridade(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return ROTULOS_SEVERIDADE[valor] ?? String(valor);
}

const COORDENADA = new Intl.NumberFormat('pt', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATA = new Intl.DateTimeFormat('pt', { dateStyle: 'medium', timeStyle: 'short' });
const PERCENTAGEM = new Intl.NumberFormat('pt');

const RECOMENDACAO: Record<Ocorrencia['status'], string> = {
  TRIADA: 'A ficha base confirma o padrão. Isole as plantas afectadas e acompanhe o talhão.',
  ENCAMINHADA: 'A confiança ficou abaixo de 60%. Aguarde a revisão de um técnico.',
  VALIDADA: 'Um técnico confirmou o caso. Mantenha o acompanhamento no talhão.',
};

const ROTULO_ESTADO: Record<Ocorrencia['status'], string> = {
  TRIADA: 'Triada',
  ENCAMINHADA: 'Encaminhada',
  VALIDADA: 'Validada',
};

function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return DATA.format(data);
}

function tempoRelativo(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const minutos = Math.round((Date.now() - data.getTime()) / 60_000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return 'há 1 dia';
  if (dias < 30) return `há ${dias} dias`;
  return formatarData(iso);
}

const ORIENTACAO_FILA: Record<Ocorrencia['status'], string> = {
  TRIADA: 'Triagem automática concluída. Confirme no mapa e acompanhe o talhão se a severidade subir.',
  ENCAMINHADA: 'Prioridade: confiança baixa. Reveja sintomas, foto e valide com nota de campo.',
  VALIDADA: 'Caso já confirmado por técnico. Use o histórico para o rasto da decisão.',
};

export function ligaMapa(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(5);
  const lng = longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`;
}

export function rotuloSintoma(id: string): string {
  return ROTULOS_SINTOMA[id] ?? id;
}

const ROTULOS_RESUMO = [
  { chave: 'total', rotulo: 'Registos' },
  { chave: 'TRIADA', rotulo: 'Triadas' },
  { chave: 'ENCAMINHADA', rotulo: 'Encaminhadas' },
  { chave: 'VALIDADA', rotulo: 'Validadas' },
] as const;

export const ResumoOcorrencias = memo(function ResumoOcorrencias({
  ocorrencias,
}: {
  ocorrencias: Ocorrencia[];
}) {
  const contagem = { total: ocorrencias.length, TRIADA: 0, ENCAMINHADA: 0, VALIDADA: 0 };
  for (const item of ocorrencias) {
    contagem[item.status] += 1;
  }

  return (
    <section className="resumo" aria-label="Resumo das ocorrências">
      {ROTULOS_RESUMO.map((item) => (
        <article key={item.chave}>
          <strong className="numero">{contagem[item.chave]}</strong>
          <span>{item.rotulo}</span>
        </article>
      ))}
    </section>
  );
});

const FotoAutenticada = memo(function FotoAutenticada({
  token,
  caminho,
  alt,
}: {
  token: string;
  caminho: string;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let ativo = true;
    obterImagem(token, caminho)
      .then((blob) => {
        if (!ativo) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (ativo) setUrl(null);
      });
    return () => {
      ativo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [caminho, token]);

  return (
    <span className={url ? 'item-miniatura' : 'item-miniatura a-carregar'}>
      {url ? (
        <img src={url} alt={alt} width={160} height={160} loading="lazy" decoding="async" />
      ) : (
        <span className="sr-only">A carregar fotografia…</span>
      )}
    </span>
  );
});

const GaleriaFotos = memo(function GaleriaFotos({
  token,
  id,
  nomes,
}: {
  token: string;
  id: string;
  nomes: string[];
}) {
  return (
    <ul className="item-fotos">
      {nomes.map((nome, indice) => (
        <li key={nome}>
          <FotoAutenticada
            token={token}
            caminho={urlDaImagem(id, nome)}
            alt={`Fotografia ${indice + 1} da ocorrência`}
          />
        </li>
      ))}
    </ul>
  );
});

export const CartaoOcorrencia = memo(function CartaoOcorrencia({
  token,
  ocorrencia,
  acao,
  variante = 'completo',
  destacado = false,
  pedidosApoio = 0,
  aoPedirApoio,
}: {
  token: string;
  ocorrencia: Ocorrencia;
  acao?: ReactNode;
  variante?: 'completo' | 'fila';
  destacado?: boolean;
  /** Quantos pedidos de apoio estão ligados a esta ocorrência. */
  pedidosApoio?: number;
  aoPedirApoio?: (ocorrenciaId: string) => void;
}) {
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const quando = formatarData(ocorrencia.criadaEm);
  const relativo = tempoRelativo(ocorrencia.criadaEm);
  const fotos = ocorrencia.imagens ?? [];
  const mapa = ligaMapa(ocorrencia.latitude, ocorrencia.longitude);
  const local = `${COORDENADA.format(ocorrencia.latitude)}, ${COORDENADA.format(ocorrencia.longitude)}`;
  const fila = variante === 'fila';
  const classes = [
    'item',
    `estado-${ocorrencia.status.toLowerCase()}`,
    'item-com-foto',
    fila ? 'item-fila' : '',
    destacado ? 'item-destacado' : '',
    fila && ocorrencia.status === 'ENCAMINHADA' ? 'item-fila-prioritaria' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes} id={destacado ? `ocorrencia-${ocorrencia.id}` : undefined}>
      {fotos.length > 0 ? (
        <GaleriaFotos token={token} id={ocorrencia.id} nomes={fotos} />
      ) : (
        <div className="item-placeholder" aria-hidden="true">
          <span>{ocorrencia.cultura.slice(0, 2).toLocaleUpperCase('pt')}</span>
          {fila ? <small>Sem foto</small> : null}
        </div>
      )}
      <div className="item-corpo">
        <header className="item-cabeca">
          <div className="item-titulo">
            <strong className="quebrar" translate="no">
              {ocorrencia.cultura}
            </strong>
            {ocorrencia.parcelaNome ? (
              <span className="item-parcela quebrar">{ocorrencia.parcelaNome}</span>
            ) : null}
            {fila && relativo ? (
              <span className="item-relativo">
                Registada <time dateTime={ocorrencia.criadaEm}>{relativo}</time>
              </span>
            ) : null}
          </div>
          <div className="item-selos">
            {fila && ocorrencia.status === 'ENCAMINHADA' ? (
              <span className="selo selo-prioridade">Prioridade</span>
            ) : null}
            <span className="selo">{ROTULO_ESTADO[ocorrencia.status]}</span>
            {pedidosApoio > 0 ? (
              <span className="selo selo-apoio">
                {pedidosApoio === 1 ? '1 pedido de apoio' : `${pedidosApoio} pedidos de apoio`}
              </span>
            ) : null}
          </div>
        </header>

        {fila ? (
          <div className="item-kpis" aria-label="Indicadores da ocorrência">
            <div className="item-kpi">
              <span className="item-kpi-rotulo">Confiança</span>
              <strong className="numero">{PERCENTAGEM.format(ocorrencia.confianca)}%</strong>
              <div
                className="progresso"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={ocorrencia.confianca}
                aria-label={`Confiança ${PERCENTAGEM.format(ocorrencia.confianca)} por cento`}
              >
                <span style={{ width: `${ocorrencia.confianca}%` }} />
              </div>
            </div>
            <div className="item-kpi">
              <span className="item-kpi-rotulo">Severidade</span>
              <strong>
                {ocorrencia.severidade != null
                  ? `${ocorrencia.severidade}/5 · ${rotuloSeveridade(ocorrencia.severidade)}`
                  : '—'}
              </strong>
              <div
                className="progresso progresso-severidade"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={5}
                aria-valuenow={ocorrencia.severidade ?? 0}
                aria-label={
                  ocorrencia.severidade != null
                    ? `Severidade ${ocorrencia.severidade} em 5`
                    : 'Severidade não indicada'
                }
              >
                <span
                  style={{
                    width: `${ocorrencia.severidade != null ? (ocorrencia.severidade / 5) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="item-kpi">
              <span className="item-kpi-rotulo">Fotos</span>
              <strong>{fotos.length}</strong>
              <span className="item-kpi-meta">{fotos.length === 1 ? 'imagem' : 'imagens'}</span>
            </div>
          </div>
        ) : null}

        {ocorrencia.sintomas.length > 0 ? (
          <ul className="item-sintomas">
            {ocorrencia.sintomas.map((id) => (
              <li key={id} className="item-sintoma">
                {rotuloSintoma(id)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="nota item-sem-sintomas">Sem sintomas assinalados</p>
        )}

        <dl className={fila ? 'item-factos item-factos-fila' : 'item-factos'}>
          {quando ? (
            <div>
              <dt>Registo</dt>
              <dd>
                <time dateTime={ocorrencia.criadaEm}>{quando}</time>
              </dd>
            </div>
          ) : null}
          {ocorrencia.validadaEm ? (
            <div>
              <dt>Validada</dt>
              <dd>
                <time dateTime={ocorrencia.validadaEm}>{formatarData(ocorrencia.validadaEm)}</time>
              </dd>
            </div>
          ) : null}
          {ocorrencia.validadaPor ? (
            <div>
              <dt>Técnico</dt>
              <dd className="quebrar" translate="no">
                {ocorrencia.validadaPor}
              </dd>
            </div>
          ) : null}
          {!fila ? (
            <div>
              <dt>Confiança</dt>
              <dd className="numero">{PERCENTAGEM.format(ocorrencia.confianca)}&nbsp;%</dd>
            </div>
          ) : null}
          {!fila && ocorrencia.severidade !== null && ocorrencia.severidade !== undefined ? (
            <div>
              <dt>Severidade</dt>
              <dd>
                {rotuloSeveridade(ocorrencia.severidade)}
                <span className="item-severidade-grau"> · {ocorrencia.severidade}/5</span>
              </dd>
            </div>
          ) : null}
          {ocorrencia.referenciaRotulo ? (
            <div>
              <dt>Referência</dt>
              <dd className="quebrar">{ocorrencia.referenciaRotulo}</dd>
            </div>
          ) : null}
          <div>
            <dt>Local</dt>
            <dd>
              <a
                className="ligacao"
                href={mapa}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir mapa em ${local} (nova janela)`}
              >
                {local}
              </a>
            </dd>
          </div>
          {ocorrencia.autorEmail || ocorrencia.autorNome ? (
            <div>
              <dt>{fila ? 'Agricultor' : 'Conta'}</dt>
              <dd
                className="quebrar item-email"
                translate="no"
                title={ocorrencia.autorEmail ?? undefined}
              >
                {(ocorrencia.autorNome ?? '').trim() || ocorrencia.autorEmail}
              </dd>
            </div>
          ) : null}
        </dl>

        {ocorrencia.notaValidacao ? (
          <blockquote className="item-nota-validacao">
            <p>{ocorrencia.notaValidacao}</p>
          </blockquote>
        ) : null}

        {!fila ? (
          <div className="item-confianca">
            <div
              className="progresso"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={ocorrencia.confianca}
              aria-label={`Confiança da triagem: ${PERCENTAGEM.format(ocorrencia.confianca)} por cento`}
            >
              <span style={{ width: `${ocorrencia.confianca}%` }} />
            </div>
          </div>
        ) : null}

        <p className={fila ? 'item-dica item-dica-fila' : 'item-dica'}>
          {fila ? ORIENTACAO_FILA[ocorrencia.status] : RECOMENDACAO[ocorrencia.status]}
        </p>

        <div className="item-historico-accoes">
          <a
            className="secundario item-historico-botao"
            href={mapa}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir mapa
          </a>
          <button
            type="button"
            className="secundario item-historico-botao"
            aria-expanded={mostrarHistorico}
            onClick={() => setMostrarHistorico((atual) => !atual)}
          >
            {mostrarHistorico ? 'Ocultar histórico' : 'Ver histórico'}
          </button>
          {aoPedirApoio ? (
            <button
              type="button"
              className="secundario item-historico-botao"
              onClick={() => aoPedirApoio(ocorrencia.id)}
            >
              {pedidosApoio > 0 ? 'Abrir pedido de apoio' : 'Pedir apoio ao técnico'}
            </button>
          ) : null}
        </div>
        {mostrarHistorico ? (
          <div className="item-historico">
            <HistoricoOcorrencia token={token} ocorrenciaId={ocorrencia.id} />
          </div>
        ) : null}
        {acao ? <div className="item-rodape">{acao}</div> : null}
      </div>
    </article>
  );
});
