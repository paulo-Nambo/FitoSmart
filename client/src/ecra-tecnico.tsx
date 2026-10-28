import { memo, useCallback, useState } from 'react';
import { validarOcorrencia, type Ocorrencia } from './api';
import { CartaoOcorrencia } from './cartao-ocorrencia';

const NOTA_FILA = (
  <p className="nota">Só o perfil TECNICO pode mudar uma ocorrência encaminhada para VALIDADA.</p>
);
const FILA_VAZIA = <p className="nota">Não há ocorrências para rever.</p>;

interface EcraTecnicoProps {
  token: string;
  ocorrencias: Ocorrencia[];
  aoValidar: (id: string) => void;
}

const LinhaFila = memo(function LinhaFila({
  ocorrencia,
  pendente,
  aoValidar,
}: {
  ocorrencia: Ocorrencia;
  pendente: boolean;
  aoValidar: (id: string) => void;
}) {
  return (
    <li>
      <CartaoOcorrencia
        ocorrencia={ocorrencia}
        acao={
          ocorrencia.status === 'ENCAMINHADA' ? (
            <button type="button" className="primario" disabled={pendente} onClick={() => aoValidar(ocorrencia.id)}>
              {pendente ? 'A validar…' : 'Validar'}
            </button>
          ) : null
        }
      />
    </li>
  );
});

export function EcraTecnico({ token, ocorrencias, aoValidar }: EcraTecnicoProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [aValidar, setAValidar] = useState<string | null>(null);
  const recentes = ocorrencias.length === 0 ? ocorrencias : [...ocorrencias].reverse();

  const validar = useCallback(
    (id: string) => {
      setErro(null);
      setAValidar(id);
      validarOcorrencia(token, id)
        .then(() => aoValidar(id))
        .catch((falha: unknown) => {
          setErro(falha instanceof Error ? falha.message : 'Falha na validação');
        })
        .finally(() => setAValidar(null));
    },
    [aoValidar, token],
  );

  return (
    <section className="cartao lista">
      <h2>Fila técnica</h2>
      {NOTA_FILA}
      {erro ? <p className="alerta">{erro}</p> : null}
      {recentes.length === 0 ? (
        FILA_VAZIA
      ) : (
        <ul>
          {recentes.map((item) => (
            <LinhaFila key={item.id} ocorrencia={item} pendente={aValidar === item.id} aoValidar={validar} />
          ))}
        </ul>
      )}
    </section>
  );
}
