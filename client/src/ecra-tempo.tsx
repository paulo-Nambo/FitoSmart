import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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

function dataCurta(dataIso: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Maputo',
  }).format(new Date(`${dataIso}T12:00:00`));
}

function CartaoDia({ dia }: { dia: DiaPrevisao }) {
  return (
    <article className={dia.eHoje ? 'tempo-dia tempo-dia-hoje' : 'tempo-dia'}>
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
      {dia.chuva !== null ? (
        <p className="tempo-dia-chuva">Chuva {Math.round(dia.chuva)}%</p>
      ) : null}
    </article>
  );
}

function MapaCalorChuva({ celulas }: { celulas: CelulaChuva[] }) {
  const max = Math.max(0.1, ...celulas.map((c) => c.precipMm));
  return (
    <div className="op-mapa" role="img" aria-label="Mapa de calor regional de chuva">
      {celulas.map((c) => {
        const intensidade = Math.min(1, c.precipMm / max);
        return (
          <div
            key={`${c.lat},${c.lon}`}
            className="op-mapa-celula"
            style={
              {
                '--chuva': String(intensidade),
              } as CSSProperties
            }
            title={`${c.lat}, ${c.lon}: ${c.precipMm} mm`}
          >
            <span>{c.precipMm}</span>
            <small>mm</small>
          </div>
        );
      })}
    </div>
  );
}

function ListaJanelas({ janelas }: { janelas: DiaOperacional[] }) {
  return (
    <ul className="op-janelas">
      {janelas.map((dia) => (
        <li key={dia.dataIso} className={classeJanela(dia.janela)}>
          <div>
            <strong>{dataCurta(dia.dataIso)}</strong>
            <span className="op-pill">{rotuloJanela(dia.janela)}</span>
          </div>
          <p>
            {dia.estado} · {dia.precipMm} mm · solo{' '}
            {dia.soloM3 !== null ? dia.soloM3.toFixed(2) : '—'} m³/m³
            {dia.deltaT !== null ? ` · ΔT ${dia.deltaT} °C` : ''}
            {dia.pressaoHpa !== null ? ` · ${dia.pressaoHpa} hPa` : ''}
          </p>
          <p className="op-motivo">{dia.motivo}</p>
        </li>
      ))}
    </ul>
  );
}

export function EcraTempo() {
  const [dias, setDias] = useState<DiaPrevisao[] | null>(null);
  const [operacional, setOperacional] = useState<PainelOperacional | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroOp, setErroOp] = useState<string | null>(null);
  const aCarregar = dias === null && !erro;

  useEffect(() => {
    const controlo = new AbortController();
    carregarPrevisaoSemanaMaputo(controlo.signal)
      .then((lista) => {
        setDias(lista);
        setErro(null);
      })
      .catch(() => {
        if (controlo.signal.aborted) return;
        setDias(null);
        setErro('Não foi possível carregar a previsão semanal. Verifique a ligação e tente novamente.');
      });
    carregarPainelOperacional(controlo.signal)
      .then((painel) => {
        setOperacional(painel);
        setErroOp(null);
      })
      .catch(() => {
        if (controlo.signal.aborted) return;
        setOperacional(null);
        setErroOp('Telemetria de pulverização indisponível de momento.');
      });
    return () => controlo.abort();
  }, []);

  const memoriaResumo = useMemo(() => {
    if (!operacional) return null;
    const seq = operacional.memoriaAgricola.estadosObservados;
    return seq.slice(-7).join(' → ');
  }, [operacional]);

  return (
    <section className="tempo-ecra" aria-busy={aCarregar}>
      <header className="lista-cabeca">
        <div>
          <h1 className="titulo">Previsão do tempo</h1>
          <p className="nota">
            Semana em {LOCAL_PREVISAO} · Open-Meteo · modelagem Markov + telemetria de pulverização · SMS 2G
          </p>
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
              <CartaoDia dia={dia} />
            </div>
          ))}
        </div>
      ) : null}

      <section className="op-painel" aria-labelledby="op-titulo">
        <header>
          <h2 id="op-titulo" className="titulo">
            Telemetria de pulverização
          </h2>
          <p className="nota">
            Cadeia de Markov com memória agrícola, Delta-T, pressão (hPa) e mapa de calor de chuva.
            Acessível também por SMS 2G (comandos JANELA, DELTAT, CHUVA, PRESSAO).
          </p>
        </header>

        {erroOp ? (
          <p className="alerta" role="alert">
            {erroOp}
          </p>
        ) : null}

        {!operacional && !erroOp ? <p className="nota">A calcular janelas operacionais…</p> : null}

        {operacional ? (
          <>
            <div className={`op-agora ${classeJanela(operacional.actual.janela)}`}>
              <p className="op-agora-rotulo">Agora em {operacional.local}</p>
              <p className="op-agora-janela">{rotuloJanela(operacional.actual.janela)}</p>
              <p className="op-motivo">{operacional.actual.motivo}</p>
              <dl className="op-metricas">
                <div>
                  <dt>Delta-T</dt>
                  <dd>{operacional.actual.deltaT !== null ? `${operacional.actual.deltaT} °C` : '—'}</dd>
                </div>
                <div>
                  <dt>Pressão</dt>
                  <dd>
                    {operacional.actual.pressaoHpa !== null
                      ? `${operacional.actual.pressaoHpa} hPa`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Humidade</dt>
                  <dd>
                    {operacional.actual.humidadePct !== null
                      ? `${operacional.actual.humidadePct} %`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Vento</dt>
                  <dd>
                    {operacional.actual.ventoKmh !== null
                      ? `${operacional.actual.ventoKmh} km/h`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Solo 0–7 cm</dt>
                  <dd>
                    {operacional.actual.soloM3 !== null
                      ? `${operacional.actual.soloM3.toFixed(2)} m³/m³`
                      : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="op-bloco">
              <h3 className="op-subtitulo">Memória agrícola (Markov)</h3>
              <p className="nota">Últimos estados: {memoriaResumo}</p>
              <ListaJanelas janelas={operacional.janelas} />
            </div>

            <div className="op-bloco">
              <h3 className="op-subtitulo">Mapa de calor regional — chuva (mm)</h3>
              <MapaCalorChuva celulas={operacional.mapaChuva} />
            </div>

            <div className="op-bloco op-sms">
              <h3 className="op-subtitulo">Acesso SMS 2G</h3>
              <p className="nota">
                Gateway: <code>POST /api/sms</code> com corpo{' '}
                <code>{`{ "texto": "JANELA" }`}</code>
              </p>
              <p className="op-sms-exemplo" translate="no">
                {operacional.smsExemplo}
              </p>
              <p className="nota">{operacional.fonte}</p>
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}
