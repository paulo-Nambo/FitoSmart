import { useEffect, useState, type CSSProperties } from 'react';
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
        <div className="tempo-dia-faixa" aria-label={`Mínima ${Math.round(dia.minima)} graus, máxima ${Math.round(dia.maxima)} graus`}>
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

export function EcraTempo() {
  const [dias, setDias] = useState<DiaPrevisao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
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
    return () => controlo.abort();
  }, []);

  return (
    <section className="tempo-ecra" aria-busy={aCarregar}>
      <header className="lista-cabeca">
        <div>
          <h1 className="titulo">Previsão do tempo</h1>
          <p className="nota">
            Semana em {LOCAL_PREVISAO} · fonte Open-Meteo (sem chave)
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
    </section>
  );
}
