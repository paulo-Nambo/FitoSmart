import { memo, type ReactNode } from 'react';
import type { Ocorrencia } from './api';

const ROTULOS_SINTOMA: Record<string, string> = {
  manchas_amarelas: 'Manchas amarelas',
  folhas_secas: 'Folhas secas',
  murcha: 'Murcha',
  pragas_visiveis: 'Pragas visíveis',
};

const AVISO_REVISAO = <p className="nota">O caso requer revisão humana.</p>;

export function rotuloSintoma(id: string): string {
  return ROTULOS_SINTOMA[id] ?? id;
}

export const CartaoOcorrencia = memo(function CartaoOcorrencia({
  ocorrencia,
  acao,
}: {
  ocorrencia: Ocorrencia;
  acao?: ReactNode;
}) {
  return (
    <article className={`item estado-${ocorrencia.status.toLowerCase()}`}>
      <header>
        <strong>{ocorrencia.cultura}</strong>
        <span className="selo">{ocorrencia.status}</span>
      </header>
      <p>{ocorrencia.sintomas.map((id) => rotuloSintoma(id)).join(', ')}</p>
      <p className="meta">
        Confiança {ocorrencia.confianca}% · {ocorrencia.latitude.toFixed(2)}, {ocorrencia.longitude.toFixed(2)}
        {ocorrencia.autorEmail ? ` · ${ocorrencia.autorEmail}` : ''}
      </p>
      <div className="barra" aria-hidden="true">
        <span style={{ width: `${ocorrencia.confianca}%` }} />
      </div>
      {ocorrencia.status === 'ENCAMINHADA' ? AVISO_REVISAO : null}
      {acao ? <div className="acoes">{acao}</div> : null}
    </article>
  );
});
