import { memo, useCallback, useState } from 'react';
import { validarOcorrencia, type Ocorrencia } from './api';
import { CartaoOcorrencia } from './cartao-ocorrencia';
import type { MenuId } from './barra-lateral';
import {
  BarraFiltro,
  contarEstados,
  filtrarEstado,
  mensagemVazia,
  porPrioridade,
  rotuloLista,
  useFiltroEstado,
} from './filtro-estado';
import { PainelEstatisticas } from './painel-estatisticas';

const NOTA_PAINEL = <p className="nota">Totais da fila. O menu abre os casos por rever.</p>;

const NOTA_FILA = (
  <p className="nota">A fila coloca primeiro os casos encaminhados. Só o perfil TECNICO pode validá-los.</p>
);

interface EcraTecnicoProps {
  menu: MenuId;
  token: string;
  ocorrencias: Ocorrencia[];
  aoValidar: (id: string) => void;
}

const LinhaFila = memo(function LinhaFila({
  token,
  ocorrencia,
  pendente,
  aoValidar,
}: {
  token: string;
  ocorrencia: Ocorrencia;
  pendente: boolean;
  aoValidar: (id: string) => void;
}) {
  return (
    <li>
      <CartaoOcorrencia
        token={token}
        ocorrencia={ocorrencia}
        acao={
          ocorrencia.status === 'ENCAMINHADA' ? (
            <button
              type="button"
              className="primario"
              disabled={pendente}
              aria-busy={pendente}
              onClick={() => aoValidar(ocorrencia.id)}
            >
              {pendente ? 'A validar…' : 'Validar ocorrência'}
            </button>
          ) : null
        }
      />
    </li>
  );
});

const FilaTecnica = memo(function FilaTecnica({
  token,
  ocorrencias,
  erro,
  aValidar,
  aoValidar,
}: {
  token: string;
  ocorrencias: Ocorrencia[];
  erro: string | null;
  aValidar: string | null;
  aoValidar: (id: string) => void;
}) {
  const { filtro, escolher } = useFiltroEstado();
  const visiveis = porPrioridade(filtrarEstado(ocorrencias, filtro));
  const contagens = contarEstados(ocorrencias);

  return (
    <section className="cartao lista">
      <header className="lista-cabeca">
        <h1 className="titulo">Fila técnica</h1>
        <p className="nota lista-total">{rotuloLista(visiveis.length, ocorrencias.length, filtro)}</p>
      </header>
      {NOTA_FILA}
      <BarraFiltro filtro={filtro} aoEscolher={escolher} contagens={contagens} />
      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : null}
      {visiveis.length === 0 ? (
        <p className="lista-vazia">{mensagemVazia(filtro)}</p>
      ) : (
        <ul>
          {visiveis.map((item) => (
            <LinhaFila
              key={item.id}
              token={token}
              ocorrencia={item}
              pendente={aValidar === item.id}
              aoValidar={aoValidar}
            />
          ))}
        </ul>
      )}
    </section>
  );
});

export function EcraTecnico({ menu, token, ocorrencias, aoValidar }: EcraTecnicoProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [aValidar, setAValidar] = useState<string | null>(null);

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
    <>
      <section hidden={menu !== 'painel'}>
        <h1 className="titulo">Painel</h1>
        {NOTA_PAINEL}
        {menu === 'painel' ? <PainelEstatisticas ocorrencias={ocorrencias} /> : null}
      </section>
      <div hidden={menu !== 'fila'}>
        <FilaTecnica token={token} ocorrencias={ocorrencias} erro={erro} aValidar={aValidar} aoValidar={validar} />
      </div>
    </>
  );
}
