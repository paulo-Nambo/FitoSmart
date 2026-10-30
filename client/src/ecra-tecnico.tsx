import { memo, startTransition, useCallback, useState } from 'react';
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
  const precisaValidacao = ocorrencia.status === 'ENCAMINHADA';

  return (
    <li className={precisaValidacao ? 'fila-linha fila-linha-urgente' : 'fila-linha'}>
      <CartaoOcorrencia
        token={token}
        ocorrencia={ocorrencia}
        variante="fila"
        acao={
          precisaValidacao ? (
            <button
              type="button"
              className="primario"
              disabled={pendente}
              aria-busy={pendente}
              onClick={() => aoValidar(ocorrencia.id)}
            >
              {pendente ? 'A validar…' : 'Validar'}
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
  const pendentes = contagens.ENCAMINHADA;

  const escolherFiltro = useCallback(
    (proximo: Parameters<typeof escolher>[0]) => {
      startTransition(() => {
        escolher(proximo);
      });
    },
    [escolher],
  );

  return (
    <section className="fila-ecra" aria-labelledby="fila-titulo">
      <header className="fila-cabeca">
        <div className="fila-cabeca-texto">
          <h1 id="fila-titulo" className="titulo">
            Fila técnica
          </h1>
          <p className="nota lista-total">{rotuloLista(visiveis.length, ocorrencias.length, filtro)}</p>
        </div>
        {pendentes > 0 ? (
          <p className="fila-badge" aria-label={`${pendentes} casos por validar`}>
            <span className="fila-badge-ponto" aria-hidden="true" />
            {pendentes === 1 ? '1 por validar' : `${pendentes} por validar`}
          </p>
        ) : (
          <p className="fila-badge fila-badge-ok">Fila em dia</p>
        )}
      </header>

      <div className="fila-ferramentas">
        <BarraFiltro filtro={filtro} aoEscolher={escolherFiltro} contagens={contagens} />
      </div>

      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : null}

      {visiveis.length === 0 ? (
        <div className="fila-vazia">
          <p>{mensagemVazia(filtro)}</p>
        </div>
      ) : (
        <ul className="fila-lista">
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
      {menu === 'fila' ? (
        <FilaTecnica token={token} ocorrencias={ocorrencias} erro={erro} aValidar={aValidar} aoValidar={validar} />
      ) : null}
    </>
  );
}
