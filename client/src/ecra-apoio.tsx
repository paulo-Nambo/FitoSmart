import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  actualizarEstadoPedidoApoio,
  criarPedidoApoio,
  ErroApi,
  listarPedidosApoio,
  obterPedidoApoio,
  responderPedidoApoio,
  type EstadoPedidoApoio,
  type Ocorrencia,
  type PedidoApoio,
} from './api';
import { podeAtenderPedidoApoio, podeCriarPedidoApoio, type Perfil } from './perfis';

const ASSUNTO_MIN = 3;
const ASSUNTO_MAX = 120;
const CORPO_MIN = 3;
const CORPO_MAX = 2000;

const ROTULO_ESTADO: Record<EstadoPedidoApoio, string> = {
  ABERTO: 'Aberto',
  EM_ATENDIMENTO: 'Em atendimento',
  ENCERRADO: 'Encerrado',
};

function formatarQuando(iso: string) {
  try {
    return new Intl.DateTimeFormat('pt-MZ', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

interface EcraApoioProps {
  token: string;
  email: string;
  perfil: Perfil;
  ocorrencias: Ocorrencia[];
  ocorrenciaInicial?: string | null;
  aoVerOcorrencia?: (ocorrenciaId: string) => void;
}

function rotuloOcorrencia(item: Ocorrencia) {
  return `${item.cultura} · ${item.status} · ${formatarQuando(item.criadaEm)}`;
}

export function EcraApoio({
  token,
  email,
  perfil,
  ocorrencias,
  ocorrenciaInicial = null,
  aoVerOcorrencia,
}: EcraApoioProps) {
  const podeCriar = podeCriarPedidoApoio(perfil);
  const podeAtender = podeAtenderPedidoApoio(perfil);
  const tituloId = useId();
  const [pedidos, setPedidos] = useState<PedidoApoio[]>([]);
  const [seleccionado, setSeleccionado] = useState<PedidoApoio | null>(null);
  const [carregar, setCarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [assunto, setAssunto] = useState('');
  const [mensagemNova, setMensagemNova] = useState('');
  const [ocorrenciaId, setOcorrenciaId] = useState('');
  const [filtroOcorrencia, setFiltroOcorrencia] = useState<string | null>(null);
  const [resposta, setResposta] = useState('');
  const [pendente, setPendente] = useState(false);

  const proprias = useMemo(
    () => ocorrencias.filter((item) => item.autorEmail === email),
    [ocorrencias, email],
  );

  const ocorrenciasVisiveis = useMemo(() => {
    if (podeCriar) return proprias;
    return ocorrencias;
  }, [podeCriar, proprias, ocorrencias]);

  const ocorrenciaFiltro = useMemo(
    () => ocorrenciasVisiveis.find((item) => item.id === filtroOcorrencia) ?? null,
    [ocorrenciasVisiveis, filtroOcorrencia],
  );

  const pedidosVisiveis = useMemo(() => {
    if (!filtroOcorrencia) return pedidos;
    return pedidos.filter((item) => item.ocorrenciaId === filtroOcorrencia);
  }, [pedidos, filtroOcorrencia]);

  const seleccionadoOcorrencia = useMemo(() => {
    if (!seleccionado?.ocorrenciaId) return null;
    return ocorrencias.find((item) => item.id === seleccionado.ocorrenciaId) ?? null;
  }, [seleccionado, ocorrencias]);

  const refrescar = useCallback(async () => {
    setErro(null);
    const dados = await listarPedidosApoio(token);
    setPedidos(dados.pedidos);
    return dados.pedidos;
  }, [token]);

  useEffect(() => {
    let ativo = true;
    setCarregar(true);
    refrescar()
      .catch((falha) => {
        if (!ativo) return;
        setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível carregar os pedidos.');
      })
      .finally(() => {
        if (ativo) setCarregar(false);
      });
    return () => {
      ativo = false;
    };
  }, [refrescar]);

  const abrir = useCallback(async (id: string) => {
    setErro(null);
    setResposta('');
    try {
      const dados = await obterPedidoApoio(token, id);
      setSeleccionado(dados.pedido);
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível abrir o pedido.');
    }
  }, [token]);

  const aplicadoInicial = useRef<string | null>(null);
  useEffect(() => {
    if (!ocorrenciaInicial || carregar) return;
    if (aplicadoInicial.current === ocorrenciaInicial) return;
    aplicadoInicial.current = ocorrenciaInicial;
    setFiltroOcorrencia(ocorrenciaInicial);
    setOcorrenciaId(ocorrenciaInicial);
    const ligada = ocorrenciasVisiveis.find((item) => item.id === ocorrenciaInicial);
    const existentes = pedidos.filter(
      (item) => item.ocorrenciaId === ocorrenciaInicial && item.estado !== 'ENCERRADO',
    );
    if (existentes[0]) {
      setMostrarNovo(false);
      void abrir(existentes[0].id);
      return;
    }
    if (!podeCriar || !ligada) return;
    setMostrarNovo(true);
    setAssunto(
      `Apoio · ${ligada.cultura} (${ligada.status === 'ENCAMINHADA' ? 'encaminhada' : ligada.status.toLowerCase()})`,
    );
    setMensagemNova(
      `Preciso de apoio sobre a ocorrência de ${ligada.cultura} registada em ${formatarQuando(ligada.criadaEm)}.`,
    );
  }, [ocorrenciaInicial, carregar, podeCriar, ocorrenciasVisiveis, pedidos, abrir]);

  const criar = async () => {
    const assuntoOk = assunto.trim();
    const mensagemOk = mensagemNova.trim();
    if (assuntoOk.length < ASSUNTO_MIN || mensagemOk.length < CORPO_MIN) return;
    setPendente(true);
    setErro(null);
    try {
      const criado = await criarPedidoApoio(token, {
        assunto: assuntoOk,
        mensagem: mensagemOk,
        ocorrenciaId: ocorrenciaId || null,
      });
      setAssunto('');
      setMensagemNova('');
      setFiltroOcorrencia(ocorrenciaId || null);
      setOcorrenciaId('');
      setMostrarNovo(false);
      await refrescar();
      setSeleccionado(criado.pedido);
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível criar o pedido.');
    } finally {
      setPendente(false);
    }
  };

  const enviarResposta = async () => {
    if (!seleccionado) return;
    const texto = resposta.trim();
    if (texto.length < CORPO_MIN) return;
    setPendente(true);
    setErro(null);
    try {
      const dados = await responderPedidoApoio(token, seleccionado.id, texto);
      setResposta('');
      setSeleccionado(dados.pedido);
      await refrescar();
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setPendente(false);
    }
  };

  const mudarEstado = async (estado: EstadoPedidoApoio) => {
    if (!seleccionado) return;
    setPendente(true);
    setErro(null);
    try {
      const dados = await actualizarEstadoPedidoApoio(token, seleccionado.id, estado);
      setSeleccionado(dados.pedido);
      await refrescar();
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível actualizar o estado.');
    } finally {
      setPendente(false);
    }
  };

  const podeResponder =
    !!seleccionado &&
    (seleccionado.autorEmail === email || (podeAtender && seleccionado.estado !== 'ENCERRADO'));

  return (
    <section className="apoio-ecra" aria-labelledby={tituloId}>
      <header className="lista-cabeca">
        <div className="lista-cabeca-texto">
          <h1 id={tituloId} className="titulo">
            Pedidos de apoio
          </h1>
          <p className="nota">
            {podeCriar
              ? 'Cada pedido liga-se a uma ocorrência para o técnico ter o contexto do campo.'
              : 'Atenda dúvidas ligadas às ocorrências dos agricultores.'}
          </p>
        </div>
        {podeCriar ? (
          <button type="button" className="primario" onClick={() => setMostrarNovo((v) => !v)}>
            {mostrarNovo ? 'Cancelar' : 'Novo pedido'}
          </button>
        ) : null}
      </header>

      {ocorrenciaFiltro ? (
        <div className="apoio-filtro-ocorrencia">
          <p>
            Filtrado pela ocorrência <strong>{rotuloOcorrencia(ocorrenciaFiltro)}</strong>
          </p>
          <button type="button" className="secundario" onClick={() => setFiltroOcorrencia(null)}>
            Ver todos
          </button>
        </div>
      ) : null}

      {erro ? (
        <p className="erro" role="alert">
          {erro}
        </p>
      ) : null}

      {mostrarNovo && podeCriar ? (
        <form
          className="apoio-novo"
          onSubmit={(evento) => {
            evento.preventDefault();
            void criar();
          }}
        >
          <label>
            <span>Ocorrência relacionada</span>
            <select
              value={ocorrenciaId}
              onChange={(evento) => setOcorrenciaId(evento.target.value)}
              required
            >
              <option value="">Seleccione uma ocorrência…</option>
              {proprias.map((item) => (
                <option key={item.id} value={item.id}>
                  {rotuloOcorrencia(item)}
                </option>
              ))}
            </select>
          </label>
          {proprias.length === 0 ? (
            <p className="nota">Registe primeiro uma ocorrência em «Nova ocorrência» para pedir apoio.</p>
          ) : null}
          <label>
            <span>Assunto</span>
            <input
              value={assunto}
              maxLength={ASSUNTO_MAX}
              onChange={(evento) => setAssunto(evento.target.value)}
              placeholder="Ex.: Manchas no milho após chuva"
              required
            />
          </label>
          <label>
            <span>Mensagem</span>
            <textarea
              value={mensagemNova}
              maxLength={CORPO_MAX}
              rows={4}
              onChange={(evento) => setMensagemNova(evento.target.value)}
              placeholder="Descreva a dúvida com o máximo de detalhe possível…"
              required
            />
          </label>
          <button
            type="submit"
            className="primario"
            disabled={
              pendente ||
              !ocorrenciaId ||
              assunto.trim().length < ASSUNTO_MIN ||
              mensagemNova.trim().length < CORPO_MIN
            }
          >
            {pendente ? 'A enviar…' : 'Enviar pedido'}
          </button>
        </form>
      ) : null}

      <div className="apoio-grelha">
        <div className="apoio-lista" aria-label="Lista de pedidos">
          {carregar ? (
            <p className="nota">A carregar pedidos…</p>
          ) : pedidosVisiveis.length === 0 ? (
            <div className="lista-vazia-caixa">
              <p>
                {filtroOcorrencia
                  ? 'Ainda não há pedidos de apoio para esta ocorrência.'
                  : 'Ainda não há pedidos de apoio.'}
              </p>
            </div>
          ) : (
            <ul className="apoio-lista-ul">
              {pedidosVisiveis.map((item) => {
                const ligada = item.ocorrenciaId
                  ? ocorrencias.find((ocorrencia) => ocorrencia.id === item.ocorrenciaId)
                  : null;
                return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      seleccionado?.id === item.id ? 'apoio-item apoio-item-activo' : 'apoio-item'
                    }
                    onClick={() => void abrir(item.id)}
                  >
                    <span className={`apoio-estado apoio-estado-${item.estado.toLowerCase()}`}>
                      {ROTULO_ESTADO[item.estado]}
                    </span>
                    <strong>{item.assunto}</strong>
                    <span className="meta">
                      {ligada ? `${ligada.cultura} · ` : ''}
                      {podeAtender || perfil === 'ADMIN_SISTEMA' ? `${item.autorEmail} · ` : ''}
                      {formatarQuando(item.actualizadoEm)}
                    </span>
                    {item.preview ? <span className="apoio-preview">{item.preview}</span> : null}
                  </button>
                </li>
              );
              })}
            </ul>
          )}
        </div>

        <div className="apoio-detalhe" aria-live="polite">
          {!seleccionado ? (
            <div className="lista-vazia-caixa">
              <p>Seleccione um pedido para ver a conversa.</p>
            </div>
          ) : (
            <>
              <header className="apoio-detalhe-cabeca">
                <div>
                  <h2>{seleccionado.assunto}</h2>
                  <p className="meta">
                    <span className={`apoio-estado apoio-estado-${seleccionado.estado.toLowerCase()}`}>
                      {ROTULO_ESTADO[seleccionado.estado]}
                    </span>
                    {' · '}
                    {seleccionado.autorEmail}
                    {seleccionado.tecnicoEmail ? ` · Técnico: ${seleccionado.tecnicoEmail}` : ''}
                  </p>
                </div>
                {podeAtender ? (
                  <div className="apoio-accoes">
                    {seleccionado.estado !== 'EM_ATENDIMENTO' ? (
                      <button
                        type="button"
                        className="secundario"
                        disabled={pendente}
                        onClick={() => void mudarEstado('EM_ATENDIMENTO')}
                      >
                        Em atendimento
                      </button>
                    ) : null}
                    {seleccionado.estado !== 'ENCERRADO' ? (
                      <button
                        type="button"
                        className="secundario"
                        disabled={pendente}
                        onClick={() => void mudarEstado('ENCERRADO')}
                      >
                        Encerrar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secundario"
                        disabled={pendente}
                        onClick={() => void mudarEstado('ABERTO')}
                      >
                        Reabrir
                      </button>
                    )}
                  </div>
                ) : null}
              </header>

              {seleccionado.ocorrenciaId ? (
                <aside className="apoio-ocorrencia-ligada">
                  <p className="apoio-ocorrencia-rotulo">Ocorrência ligada</p>
                  {seleccionadoOcorrencia ? (
                    <>
                      <p>
                        <strong>{seleccionadoOcorrencia.cultura}</strong>
                        {' · '}
                        {seleccionadoOcorrencia.status}
                        {' · confiança '}
                        {seleccionadoOcorrencia.confianca}%
                      </p>
                      <p className="meta">
                        {seleccionadoOcorrencia.sintomas.join(', ') || 'Sem sintomas'}
                        {' · '}
                        {formatarQuando(seleccionadoOcorrencia.criadaEm)}
                      </p>
                    </>
                  ) : (
                    <p className="nota">Ocorrência associada (detalhe indisponível nesta sessão).</p>
                  )}
                  {aoVerOcorrencia ? (
                    <button
                      type="button"
                      className="secundario"
                      onClick={() => aoVerOcorrencia(seleccionado.ocorrenciaId!)}
                    >
                      Ver ocorrência
                    </button>
                  ) : null}
                </aside>
              ) : (
                <p className="nota">Este pedido não tem ocorrência ligada.</p>
              )}

              <ol className="apoio-thread">
                {(seleccionado.mensagens ?? []).map((mensagem) => {
                  const propria = mensagem.autorEmail === email;
                  return (
                    <li
                      key={mensagem.id}
                      className={propria ? 'apoio-msg apoio-msg-propria' : 'apoio-msg'}
                    >
                      <div className="apoio-msg-meta">
                        <strong>{propria ? 'Você' : mensagem.autorEmail}</strong>
                        <time dateTime={mensagem.criadoEm}>{formatarQuando(mensagem.criadoEm)}</time>
                      </div>
                      <p>{mensagem.corpo}</p>
                    </li>
                  );
                })}
              </ol>

              {podeResponder ? (
                <form
                  className="apoio-resposta"
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    void enviarResposta();
                  }}
                >
                  <label>
                    <span>
                      {seleccionado.estado === 'ENCERRADO' && seleccionado.autorEmail === email
                        ? 'Reabrir com nova mensagem'
                        : 'Resposta'}
                    </span>
                    <textarea
                      value={resposta}
                      maxLength={CORPO_MAX}
                      rows={3}
                      onChange={(evento) => setResposta(evento.target.value)}
                      placeholder="Escreva a sua mensagem…"
                      disabled={pendente}
                    />
                  </label>
                  <button
                    type="submit"
                    className="primario"
                    disabled={pendente || resposta.trim().length < CORPO_MIN}
                  >
                    {pendente ? 'A enviar…' : 'Enviar'}
                  </button>
                </form>
              ) : (
                <p className="nota">Este pedido está encerrado.</p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
