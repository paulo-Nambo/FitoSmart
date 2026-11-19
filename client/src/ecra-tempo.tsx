import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { BarXAxis } from '@/components/charts/bar-x-axis';
import { chartCssVars } from '@/components/charts/chart-context';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import type {
  CelulaChuva,
  DiaOperacional,
  JanelaPulverizacao,
  PainelOperacional,
} from './api';
import { carregarPainelOperacional } from './operacional-meteo';
import {
  carregarPrevisaoSemanaMaputo,
  LOCAL_PREVISAO,
  type DiaPrevisao,
} from './previsao-tempo';

const MM = new Intl.NumberFormat('pt', { maximumFractionDigits: 1 });
const ROTULOS_GRELHA = ['NO', 'N', 'NE', 'O', 'Centro', 'E', 'SO', 'S', 'SE'] as const;

function faixaStyle(minima: number, maxima: number): CSSProperties {
  return {
    '--min': `${Math.max(0, Math.min(100, ((minima + 5) / 45) * 100))}%`,
    '--max': `${Math.max(0, Math.min(100, ((maxima + 5) / 45) * 100))}%`,
  } as CSSProperties;
}

function rotuloJanela(janela: JanelaPulverizacao): string {
  if (janela === 'FAVORAVEL') return 'Favorável';
  if (janela === 'CONDICIONAL') return 'Condicional';
  return 'Desfavorável';
}

function classeJanela(janela: JanelaPulverizacao): string {
  if (janela === 'FAVORAVEL') return 'op-janela-ok';
  if (janela === 'CONDICIONAL') return 'op-janela-meio';
  return 'op-janela-nao';
}

function CartaoDia({
  dia,
  operacional,
}: {
  dia: DiaPrevisao;
  operacional?: DiaOperacional | null;
}) {
  return (
    <article
      className={dia.eHoje ? 'tempo-dia tempo-dia-hoje' : 'tempo-dia'}
      title={operacional?.motivo}
    >
      <header className="tempo-dia-cabeca">
        <p className="tempo-dia-nome">{dia.kind}</p>
        <p className="tempo-dia-data">{dia.meta.replace(`${LOCAL_PREVISAO} · `, '')}</p>
      </header>
      {dia.temperatura !== null ? (
        <p className="tempo-dia-temp">
          {Math.round(dia.temperatura)}
          <span>°C</span>
        </p>
      ) : (
        <p className="tempo-dia-temp tempo-dia-temp-vazia">—</p>
      )}
      <p className="tempo-dia-condicao">{dia.title}</p>
      {dia.maxima !== null && dia.minima !== null ? (
        <div
          className="tempo-dia-faixa"
          aria-label={`Mínima ${Math.round(dia.minima)} graus, máxima ${Math.round(dia.maxima)} graus`}
        >
          <span>{Math.round(dia.minima)}°</span>
          <span className="destaque-faixa-barra">
            <i style={faixaStyle(dia.minima, dia.maxima)} />
          </span>
          <span>{Math.round(dia.maxima)}°</span>
        </div>
      ) : null}
      <footer className="tempo-dia-rodape">
        {dia.chuva !== null ? <span>Chuva {Math.round(dia.chuva)}%</span> : <span />}
        {operacional ? (
          <span className={`op-pill ${classeJanela(operacional.janela)}`}>
            {rotuloJanela(operacional.janela)}
          </span>
        ) : null}
      </footer>
    </article>
  );
}

function GraficoChuvaRegional({ celulas }: { celulas: CelulaChuva[] }) {
  const reduzido = useReducedMotion();
  const dados = useMemo(
    () =>
      celulas.map((c, i) => ({
        zona: ROTULOS_GRELHA[i] ?? `${c.lat}`,
        precipMm: c.precipMm,
        lat: c.lat,
        lon: c.lon,
      })),
    [celulas],
  );
  const assinatura = dados.map((d) => d.precipMm).join('-');

  return (
    <div className="op-grafico-chuva" aria-label="Chuva regional em milímetros">
      <BarChart
        data={dados}
        xDataKey="zona"
        animationDuration={reduzido ? 0 : 1100}
        revealSignature={assinatura}
        aspectRatio="2.6 / 1"
      >
        <Grid horizontal />
        <Bar
          dataKey="precipMm"
          fill={chartCssVars.linePrimary}
          lineCap="round"
          showValue
          valueLabelFormatter={(valor) => MM.format(valor)}
        />
        <BarXAxis />
        <ChartTooltip
          rows={(ponto) => [
            {
              color: chartCssVars.linePrimary,
              label: 'Chuva',
              value: `${MM.format(Number(ponto.precipMm))} mm`,
            },
            {
              color: chartCssVars.linePrimary,
              label: 'Coord.',
              value: `${ponto.lat}, ${ponto.lon}`,
            },
          ]}
        />
      </BarChart>
    </div>
  );
}

export function EcraTempo() {
  const [dias, setDias] = useState<DiaPrevisao[] | null>(null);
  const [operacional, setOperacional] = useState<PainelOperacional | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroOp, setErroOp] = useState<string | null>(null);
  const aCarregar = dias === null && !erro;

  useEffect(() => {
    let activo = true;
    const controloTempo = new AbortController();
    carregarPrevisaoSemanaMaputo(controloTempo.signal)
      .then((lista) => {
        if (!activo) return;
        setDias(lista);
        setErro(null);
      })
      .catch(() => {
        if (!activo || controloTempo.signal.aborted) return;
        setDias(null);
        setErro('Não foi possível carregar a previsão semanal. Verifique a ligação e tente novamente.');
      });
    carregarPainelOperacional()
      .then((painel) => {
        if (!activo) return;
        setOperacional(painel);
        setErroOp(null);
      })
      .catch(() => {
        if (!activo) return;
        setOperacional(null);
        setErroOp('Telemetria de pulverização indisponível de momento.');
      });
    return () => {
      activo = false;
      controloTempo.abort();
    };
  }, []);

  const memoriaResumo = useMemo(() => {
    if (!operacional) return null;
    return operacional.memoriaAgricola.estadosObservados.slice(-7);
  }, [operacional]);

  const janelaPorDia = useMemo(() => {
    const mapa = new Map<string, DiaOperacional>();
    if (!operacional) return mapa;
    for (const item of operacional.janelas) mapa.set(item.dataIso, item);
    return mapa;
  }, [operacional]);

  return (
    <section className="tempo-ecra" aria-busy={aCarregar}>
      <header className="lista-cabeca">
        <div>
          <h1 className="titulo">Previsão do tempo</h1>
          <p className="tempo-local">{LOCAL_PREVISAO}</p>
        </div>
      </header>

      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : null}

      {aCarregar ? <p className="nota">A carregar a semana…</p> : null}

      {dias ? (
        <div className="tempo-grelha" role="list">
          {dias.map((dia) => (
            <div key={dia.id} role="listitem">
              <CartaoDia dia={dia} operacional={janelaPorDia.get(dia.dataIso) ?? null} />
            </div>
          ))}
        </div>
      ) : null}

      <section className="op-painel" aria-labelledby="op-titulo">
        <h2 id="op-titulo" className="op-titulo">
          Pulverização agora
        </h2>

        {erroOp ? (
          <p className="alerta" role="alert">
            {erroOp}
          </p>
        ) : null}

        {!operacional && !erroOp ? <p className="nota">A calcular janela operacional…</p> : null}

        {operacional ? (
          <>
            <div className={`op-agora ${classeJanela(operacional.actual.janela)}`}>
              <div className="op-agora-principal">
                <p className="op-agora-rotulo">{operacional.local}</p>
                <p className="op-agora-janela">{rotuloJanela(operacional.actual.janela)}</p>
                <p className="op-motivo">{operacional.actual.motivo}</p>
              </div>
              <dl className="op-metricas">
                <div>
                  <dt>Delta-T</dt>
                  <dd>{operacional.actual.deltaT !== null ? `${operacional.actual.deltaT}°` : '—'}</dd>
                </div>
                <div>
                  <dt>Pressão</dt>
                  <dd>
                    {operacional.actual.pressaoHpa !== null
                      ? `${Math.round(operacional.actual.pressaoHpa)}`
                      : '—'}
                    <span className="op-unidade">hPa</span>
                  </dd>
                </div>
                <div>
                  <dt>Humidade</dt>
                  <dd>
                    {operacional.actual.humidadePct !== null
                      ? `${operacional.actual.humidadePct}`
                      : '—'}
                    <span className="op-unidade">%</span>
                  </dd>
                </div>
                <div>
                  <dt>Vento</dt>
                  <dd>
                    {operacional.actual.ventoKmh !== null
                      ? `${Math.round(operacional.actual.ventoKmh)}`
                      : '—'}
                    <span className="op-unidade">km/h</span>
                  </dd>
                </div>
                <div>
                  <dt>Solo</dt>
                  <dd>
                    {operacional.actual.soloM3 !== null
                      ? operacional.actual.soloM3.toFixed(2)
                      : '—'}
                    <span className="op-unidade">m³</span>
                  </dd>
                </div>
              </dl>
            </div>

            {memoriaResumo && memoriaResumo.length > 0 ? (
              <div className="op-memoria" aria-label="Memória agrícola">
                <span className="op-memoria-rotulo">Memória</span>
                <ol className="op-memoria-lista">
                  {memoriaResumo.map((estado, i) => (
                    <li key={`${estado}-${i}`}>{estado}</li>
                  ))}
                </ol>
              </div>
            ) : null}

            <div className="op-bloco">
              <h3 className="op-subtitulo">Chuva regional</h3>
              <GraficoChuvaRegional celulas={operacional.mapaChuva} />
            </div>

            <aside className="op-sms" aria-label="Exemplo SMS 2G">
              <span className="op-sms-rotulo">SMS</span>
              <p className="op-sms-exemplo" translate="no">
                {operacional.smsExemplo}
              </p>
            </aside>
          </>
        ) : null}
      </section>
    </section>
  );
}
