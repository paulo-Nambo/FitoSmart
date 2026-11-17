import { useEffect, useId, useState } from 'react';
import { ErroApi, listarRankingTecnicos, type RankingTecnico } from './api';

function EstrelasMedia({ media }: { media: number }) {
  const cheias = Math.round(media);
  return (
    <span className="ranking-estrelas" aria-label={`${media.toFixed(1)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((valor) => (
        <span key={valor} className={valor <= cheias ? 'estrela estrela-cheia' : 'estrela'} aria-hidden="true">
          ★
        </span>
      ))}
      <strong>{media.toFixed(1)}</strong>
    </span>
  );
}

export function EcraRanking({ token }: { token: string }) {
  const tituloId = useId();
  const [ranking, setRanking] = useState<RankingTecnico[]>([]);
  const [carregar, setCarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregar(true);
    listarRankingTecnicos(token)
      .then((dados) => {
        if (ativo) setRanking(dados.ranking);
      })
      .catch((falha) => {
        if (!ativo) return;
        setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível carregar o ranking.');
      })
      .finally(() => {
        if (ativo) setCarregar(false);
      });
    return () => {
      ativo = false;
    };
  }, [token]);

  return (
    <section className="ranking-ecra" aria-labelledby={tituloId}>
      <header className="lista-cabeca">
        <div className="lista-cabeca-texto">
          <h1 id={tituloId} className="titulo">
            Melhores técnicos
          </h1>
        </div>
      </header>

      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : null}

      {carregar ? (
        <p className="nota">A carregar ranking…</p>
      ) : ranking.length === 0 ? (
        <div className="apoio-vazio">
          <h2>Ainda sem avaliações</h2>
          <p>
            Quando os agricultores avaliarem assistências encerradas, o ranking dos técnicos e agronómios
            aparece aqui.
          </p>
        </div>
      ) : (
        <ol className="ranking-lista">
          {ranking.map((item, indice) => (
            <li key={item.email} className={indice === 0 ? 'ranking-item ranking-item-topo' : 'ranking-item'}>
              <span className="ranking-posicao" aria-label={`Posição ${indice + 1}`}>
                {indice + 1}
              </span>
              <div className="ranking-identidade">
                <strong>{item.nome}</strong>
                <span className="meta" translate="no">
                  {item.email}
                </span>
              </div>
              <div className="ranking-metricas">
                <EstrelasMedia media={item.media} />
                <span className="meta">
                  {item.total === 1 ? '1 assistência' : `${item.total} assistências`}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
