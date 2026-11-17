import { memo, startTransition, useCallback, useId, useMemo, useState } from 'react';
import { validarOcorrencia, type Ocorrencia } from './api';
import { CartaoOcorrencia } from './cartao-ocorrencia';
import type { MenuId } from './barra-lateral';
import { exportarOcorrenciasCsv } from './exportar-csv';
import { filtrarPesquisa } from './filtrar-pesquisa';
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
import { VistaMapaOcorrencias } from './vista-mapa-ocorrencias';

const NOTA_PAINEL = <p className="nota">Totais da fila. O menu abre os casos por rever.</p>;
const NOTA_MIN = 3;
const NOTA_MAX = 500;

interface EcraTecnicoProps {
  menu: MenuId;
  token: string;
  ocorrencias: Ocorrencia[];
  aoValidar: (ocorrencia: Ocorrencia) => void;
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
  aoValidar: (id: string, nota: string) => void;
}) {
  const [nota, setNota] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const precisaValidacao = ocorrencia.status === 'ENCAMINHADA';
  const notaOk = nota.trim().length >= NOTA_MIN && nota.trim().length <= NOTA_MAX;

  return (
    <li className={precisaValidacao ? 'fila-linha fila-linha-urgente' : 'fila-linha'}>
      <CartaoOcorrencia
        token={token}
        ocorrencia={ocorrencia}
        variante="fila"
        acao={
          precisaValidacao ? (
            <div className="fila-validacao">
              {mostrarForm ? (
                <>
                  <label className="fila-nota-campo">
                    <span>Nota de validação</span>
                    <textarea
                      value={nota}
                      onChange={(evento) => setNota(evento.target.value)}
                      rows={3}
                      maxLength={NOTA_MAX}
                      placeholder="Descreva a confirmação em campo (mín. 3 caracteres)…"
                      disabled={pendente}
                    />
                  </label>
                  <div className="fila-nota-accoes">
                    <button
                      type="button"
                      className="primario"
                      disabled={pendente || !notaOk}
                      aria-busy={pendente}
                      aria-label={`Confirmar validação de ${ocorrencia.cultura}`}
                      onClick={() => aoValidar(ocorrencia.id, nota.trim())}
                    >
                      {pendente ? 'A validar…' : 'Confirmar validação'}
                    </button>
                    <button
                      type="button"
                      className="secundario"
                      disabled={pendente}
                      onClick={() => {
                        setMostrarForm(false);
                        setNota('');
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="primario"
                  disabled={pendente}
                  aria-label={`Validar ocorrência de ${ocorrencia.cultura}`}
                  onClick={() => setMostrarForm(true)}
                >
                  Validar ocorrência
                </button>
              )}
            </div>
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
  aoValidar: (id: string, nota: string) => void;
}) {
  const tituloId = useId();
  const filtrosId = useId();
  const { filtro, escolher } = useFiltroEstado();
  const [pesquisa, setPesquisa] = useState('');
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista');
  const filtradasEstado = porPrioridade(filtrarEstado(ocorrencias, filtro));
  const visiveis = useMemo(() => filtrarPesquisa(filtradasEstado, pesquisa), [filtradasEstado, pesquisa]);
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
    <section className="fila-ecra" aria-labelledby={tituloId}>
      <header className="fila-cabeca">
        <div className="fila-cabeca-texto">
          <h1 id={tituloId} className="titulo">
            Fila técnica
          </h1>
          <p className="nota lista-total">{rotuloLista(visiveis.length, ocorrencias.length, filtro)}</p>
        </div>
        <div className="lista-cabeca-accoes">
          {pendentes > 0 ? (
            <p className="fila-badge" aria-live="polite">
              <span className="fila-badge-ponto" aria-hidden="true" />
              {pendentes === 1 ? '1 por validar' : `${pendentes} por validar`}
            </p>
          ) : (
            <p className="fila-badge fila-badge-ok" aria-live="polite">
              Fila em dia
            </p>
          )}
          <div className="vista-toggle" role="group" aria-label="Vista da fila">
            <button
              type="button"
              className={vista === 'lista' ? 'vista-toggle-activo' : undefined}
              aria-pressed={vista === 'lista'}
              onClick={() => setVista('lista')}
            >
              Lista
            </button>
            <button
              type="button"
              className={vista === 'mapa' ? 'vista-toggle-activo' : undefined}
              aria-pressed={vista === 'mapa'}
              onClick={() => setVista('mapa')}
            >
              Mapa
            </button>
          </div>
          <button
            type="button"
            className="secundario"
            disabled={visiveis.length === 0}
            onClick={() => exportarOcorrenciasCsv(visiveis, 'fila-tecnica-fitosmart.csv')}
          >
            Exportar CSV
          </button>
        </div>
      </header>

      <div className="fila-ferramentas lista-ferramentas-ext" id={filtrosId}>
        <label className="lista-pesquisa">
          <span className="sr-only">Pesquisar na fila</span>
          <input
            type="search"
            value={pesquisa}
            onChange={(evento) => setPesquisa(evento.target.value)}
            placeholder="Pesquisar cultura, parcela, sintoma…"
            autoComplete="off"
          />
        </label>
        <BarraFiltro filtro={filtro} aoEscolher={escolherFiltro} contagens={contagens} />
      </div>

      <div className="fila-estado" aria-live="polite" aria-atomic="true">
        {erro ? (
          <p className="alerta" role="alert">
            {erro} Tente validar de novo.
          </p>
        ) : null}
      </div>

      {visiveis.length === 0 ? (
        <div className="fila-vazia" role="status">
          <p>{pesquisa.trim() ? 'Nenhuma ocorrência corresponde à pesquisa.' : mensagemVazia(filtro)}</p>
          {filtro !== 'todas' || pesquisa.trim() ? (
            <button
              type="button"
              className="secundario"
              onClick={() => {
                escolherFiltro('todas');
                setPesquisa('');
              }}
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      ) : vista === 'mapa' ? (
        <VistaMapaOcorrencias ocorrencias={visiveis} />
      ) : (
        <ul className="fila-lista" aria-describedby={filtrosId}>
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
    (id: string, nota: string) => {
      setErro(null);
      setAValidar(id);
      validarOcorrencia(token, id, nota)
        .then((resposta) => {
          if (!resposta.ocorrencia) {
            throw new Error('A API não devolveu a ocorrência validada.');
          }
          aoValidar(resposta.ocorrencia);
        })
        .catch((falha: unknown) => {
          setErro(falha instanceof Error ? falha.message : 'Não foi possível validar a ocorrência.');
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
