import { memo, useEffect, useState } from 'react';
import { obterHistoricoOcorrencia, type EventoOcorrencia } from './api';

const DATA = new Intl.DateTimeFormat('pt', { dateStyle: 'medium', timeStyle: 'short' });

const ROTULO_ESTADO: Record<NonNullable<EventoOcorrencia['paraStatus']>, string> = {
  TRIADA: 'Triada',
  ENCAMINHADA: 'Encaminhada',
  VALIDADA: 'Validada',
};

function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return DATA.format(data);
}

export const HistoricoOcorrencia = memo(function HistoricoOcorrencia({
  token,
  ocorrenciaId,
}: {
  token: string;
  ocorrenciaId: string;
}) {
  const [eventos, setEventos] = useState<EventoOcorrencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setEventos(null);
    setErro(null);
    obterHistoricoOcorrencia(token, ocorrenciaId)
      .then((resposta) => {
        if (activo) setEventos(resposta.historico);
      })
      .catch((falha: unknown) => {
        if (activo) {
          setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar o histórico.');
        }
      });
    return () => {
      activo = false;
    };
  }, [ocorrenciaId, token]);

  if (erro) {
    return (
      <p className="alerta historico-alerta" role="alert">
        {erro}
      </p>
    );
  }

  if (!eventos) {
    return <p className="nota historico-carrega">A carregar histórico…</p>;
  }

  if (eventos.length === 0) {
    return <p className="nota">Sem eventos registados.</p>;
  }

  return (
    <ol className="historico-lista">
      {eventos.map((evento) => {
        const de = evento.deStatus ? ROTULO_ESTADO[evento.deStatus] : 'Novo';
        const para = ROTULO_ESTADO[evento.paraStatus];
        return (
          <li key={evento.id} className="historico-item">
            <div className="historico-cabeca">
              <strong>
                {de} → {para}
              </strong>
              <time dateTime={evento.criadoEm}>{formatarData(evento.criadoEm)}</time>
            </div>
            {evento.actorEmail ? (
              <p className="nota historico-actor" translate="no">
                {evento.actorEmail}
              </p>
            ) : null}
            {evento.nota ? <p className="historico-nota">{evento.nota}</p> : null}
          </li>
        );
      })}
    </ol>
  );
});
