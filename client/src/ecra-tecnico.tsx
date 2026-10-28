import { useState } from 'react';
import { validarOcorrencia, type Ocorrencia } from './api';
import { CartaoOcorrencia } from './ecra-ocorrencia';

interface EcraTecnicoProps {
  token: string;
  ocorrencias: Ocorrencia[];
  aoValidar: (id: string) => void;
}

export function EcraTecnico({ token, ocorrencias, aoValidar }: EcraTecnicoProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [aValidar, setAValidar] = useState<string | null>(null);
  const recentes = [...ocorrencias].reverse();

  async function validar(id: string) {
    setErro(null);
    setAValidar(id);
    try {
      await validarOcorrencia(token, id);
      aoValidar(id);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha na validação');
    } finally {
      setAValidar(null);
    }
  }

  return (
    <section className="cartao lista">
      <h2>Fila técnica</h2>
      <p className="nota">Só o perfil TECNICO pode mudar uma ocorrência encaminhada para VALIDADA.</p>
      {erro ? <p className="alerta">{erro}</p> : null}
      {recentes.length === 0 ? <p className="nota">Não há ocorrências para rever.</p> : null}
      {recentes.length > 0 ? (
        <ul>
          {recentes.map((item) => (
            <li key={item.id}>
              <CartaoOcorrencia
                ocorrencia={item}
                acao={
                  item.status === 'ENCAMINHADA' ? (
                    <button
                      type="button"
                      className="primario"
                      disabled={aValidar === item.id}
                      onClick={() => void validar(item.id)}
                    >
                      {aValidar === item.id ? 'A validar…' : 'Validar'}
                    </button>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
