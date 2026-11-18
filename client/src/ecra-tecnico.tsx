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
          ) : (
            <div className="fila-estado-resumo">
              <span className={`fila-estado-ponto fila-estado-ponto-${ocorrencia.status.toLowerCase()}`} />
              <p>
                {ocorrencia.status === 'VALIDADA'
                  ? 'Validação concluída — sem acção pendente.'
                  : 'Triagem automática estável — sem validação urgente.'}
              </p>
            </div>
          )
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
        <div className="fila-cabeca-accoes" aria-label="Ferramentas da fila">
          <div
            className={pendentes > 0 ? 'fila-estado-pill' : 'fila-estado-pill fila-estado-pill-ok'}
            aria-live="polite"
          >
            <span className="fila-estado-pill-ponto" aria-hidden="true" />
            <div className="fila-estado-pill-texto">
              <strong>{pendentes > 0 ? (pendentes === 1 ? '1 por validar' : `${pendentes} por validar`) : 'Fila em dia'}</strong>
              <span>
                {contagens.todas === 0
                  ? 'Sem ocorrências'
                  : `${contagens.TRIADA} triadas · ${contagens.VALIDADA} validadas`}
              </span>
            </div>
          </div>

          <div className="fila-toolbar">
            <div className="vista-toggle" role="group" aria-label="Vista da fila">
              <button
                type="button"
                className={vista === 'lista' ? 'vista-toggle-activo' : undefined}
                aria-pressed={vista === 'lista'}
                onClick={() => setVista('lista')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M7 7h12M7 12h12M7 17h8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                  <circle cx="4.2" cy="7" r="1" fill="currentColor" />
                  <circle cx="4.2" cy="12" r="1" fill="currentColor" />
                  <circle cx="4.2" cy="17" r="1" fill="currentColor" />
                </svg>
                Lista
              </button>
              <button
                type="button"
                className={vista === 'mapa' ? 'vista-toggle-activo' : undefined}
                aria-pressed={vista === 'mapa'}
                onClick={() => setVista('mapa')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4.5 7.2l5-2.2 5 2.2 5-2.2v12.3l-5 2.2-5-2.2-5 2.2V7.2z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                  <path d="M9.5 5v12.3M14.5 7.2V19.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
                </svg>
                Mapa
              </button>
            </div>

            <button
              type="button"
              className="secundario fila-exportar"
              disabled={visiveis.length === 0}
              onClick={() => exportarOcorrenciasCsv(visiveis, 'fila-tecnica-fitosmart.csv')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 4.5v9.2M8.5 10.2L12 13.7l3.5-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5.5 16.5v2.2A1.3 1.3 0 0 0 6.8 20h10.4a1.3 1.3 0 0 0 1.3-1.3v-2.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
              CSV
            </button>
          </div>
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
        {menu === 'painel' ? <PainelEstatisticas ocorrencias={ocorrencias} /> : null}
      </section>
      {menu === 'fila' ? (
        <FilaTecnica token={token} ocorrencias={ocorrencias} erro={erro} aValidar={aValidar} aoValidar={validar} />
      ) : null}
    </>
  );
}
