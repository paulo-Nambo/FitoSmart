import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  actualizarEstadoPedidoApoio,
  avaliarPedidoApoio,
  criarPedidoApoio,
  ErroApi,
  listarPedidosApoio,
  listarTecnicos,
  obterPedidoApoio,
  responderPedidoApoio,
  type Conta,
  type EstadoPedidoApoio,
  type Estrelas,
  type Ocorrencia,
  type PedidoApoio,
} from './api';
import { rotuloSintoma } from './cartao-ocorrencia';
import { podeAtenderPedidoApoio, podeCriarPedidoApoio, ROTULO_PERFIL, type Perfil } from './perfis';

const ASSUNTO_MIN = 3;
const ASSUNTO_MAX = 120;
const CORPO_MIN = 3;
const CORPO_MAX = 2000;

const ROTULO_ESTADO: Record<EstadoPedidoApoio, string> = {
  ABERTO: 'Aberto',
  EM_ATENDIMENTO: 'Em atendimento',
  ENCERRADO: 'Encerrado',
};

const ROTULO_STATUS_OCORRENCIA: Record<Ocorrencia['status'], string> = {
  TRIADA: 'Triada',
  ENCAMINHADA: 'Encaminhada',
  VALIDADA: 'Validada',
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

function IconeApoio() {
  return (
    <svg className="apoio-vazio-icone" viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="currentColor" opacity="0.1" />
      <path
        d="M12 14h24v16H20l-8 6V14z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M18 21h12M18 26h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface EcraApoioProps {
  token: string;
  email: string;
  perfil: Perfil;
  ocorrencias: Ocorrencia[];
  ocorrenciaInicial?: string | null;
  aoVerOcorrencia?: (ocorrenciaId: string) => void;
  aoIrNovaOcorrencia?: () => void;
}

export function EcraApoio({
  token,
  email,
  perfil,
  ocorrencias,
  ocorrenciaInicial = null,
  aoVerOcorrencia,
  aoIrNovaOcorrencia,
}: EcraApoioProps) {
  const podeCriar = podeCriarPedidoApoio(perfil);
  const podeAtender = podeAtenderPedidoApoio(perfil);
  const tituloId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const threadRef = useRef<HTMLOlElement>(null);
  const [pedidos, setPedidos] = useState<PedidoApoio[]>([]);
  const [seleccionado, setSeleccionado] = useState<PedidoApoio | null>(null);
  const [carregar, setCarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [assunto, setAssunto] = useState('');
  const [mensagemNova, setMensagemNova] = useState('');
  const [ocorrenciaId, setOcorrenciaId] = useState('');
  const [tecnicoEmail, setTecnicoEmail] = useState('');
  const [tecnicos, setTecnicos] = useState<Conta[]>([]);
  const [filtroOcorrencia, setFiltroOcorrencia] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoPedidoApoio>('todos');
  const [filtroMeus, setFiltroMeus] = useState(false);
  const [resposta, setResposta] = useState('');
  const [estrelas, setEstrelas] = useState<Estrelas | 0>(0);
  const [comentarioAvaliacao, setComentarioAvaliacao] = useState('');
  const [pendente, setPendente] = useState(false);

  const proprias = useMemo(
    () =>
      [...ocorrencias]
        .filter((item) => item.autorEmail === email)
        .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)),
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

  const ocorrenciaEscolhida = useMemo(
    () => proprias.find((item) => item.id === ocorrenciaId) ?? null,
    [proprias, ocorrenciaId],
  );

  const contagens = useMemo(() => {
    const base = { ABERTO: 0, EM_ATENDIMENTO: 0, ENCERRADO: 0, total: pedidos.length };
    for (const pedido of pedidos) base[pedido.estado] += 1;
    return base;
  }, [pedidos]);

  const nomeTecnico = useCallback(
    (email: string | null | undefined) => {
      if (!email) return null;
      const conta = tecnicos.find((item) => item.email === email);
      return conta?.nome?.trim() || email;
    },
    [tecnicos],
  );

  const pedidosVisiveis = useMemo(() => {
    let lista = pedidos;
    if (filtroOcorrencia) lista = lista.filter((item) => item.ocorrenciaId === filtroOcorrencia);
    if (filtroEstado !== 'todos') lista = lista.filter((item) => item.estado === filtroEstado);
    if (filtroMeus && podeAtender) {
      lista = lista.filter((item) => item.tecnicoEmail === email);
    }
    return lista;
  }, [pedidos, filtroOcorrencia, filtroEstado, filtroMeus, podeAtender, email]);

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
    Promise.all([
      refrescar(),
      listarTecnicos(token).catch(() => ({ tecnicos: [] as Conta[] })),
    ])
      .then(([, dadosTecnicos]) => {
        if (ativo) setTecnicos(dadosTecnicos.tecnicos);
      })
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
  }, [refrescar, token]);

  const abrir = useCallback(
    async (id: string) => {
      setErro(null);
      setResposta('');
      setEstrelas(0);
      setComentarioAvaliacao('');
      setMostrarNovo(false);
      try {
        const dados = await obterPedidoApoio(token, id);
        setSeleccionado(dados.pedido);
      } catch (falha) {
        setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível abrir o pedido.');
      }
    },
    [token],
  );

  const enviarAvaliacao = async () => {
    if (!seleccionado || !estrelas) return;
    setPendente(true);
    setErro(null);
    try {
      const dados = await avaliarPedidoApoio(token, seleccionado.id, {
        estrelas,
        comentario: comentarioAvaliacao.trim() || null,
      });
      setSeleccionado(dados.pedido);
      setEstrelas(0);
      setComentarioAvaliacao('');
      await refrescar();
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível guardar a avaliação.');
    } finally {
      setPendente(false);
    }
  };

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
      `Apoio · ${ligada.cultura} (${ROTULO_STATUS_OCORRENCIA[ligada.status].toLowerCase()})`,
    );
    setMensagemNova(
      `Preciso de apoio sobre a ocorrência de ${ligada.cultura} registada em ${formatarQuando(ligada.criadaEm)}.`,
    );
  }, [ocorrenciaInicial, carregar, podeCriar, ocorrenciasVisiveis, pedidos, abrir]);

  useEffect(() => {
    if (!mostrarNovo) return;
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [mostrarNovo]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [seleccionado?.id, seleccionado?.mensagens?.length]);

  const escolherOcorrencia = (id: string) => {
    setOcorrenciaId(id);
    const ligada = proprias.find((item) => item.id === id);
    if (!ligada) return;
    if (!assunto.trim()) {
      setAssunto(
        `Apoio · ${ligada.cultura} (${ROTULO_STATUS_OCORRENCIA[ligada.status].toLowerCase()})`,
      );
    }
    if (!mensagemNova.trim()) {
      setMensagemNova(
        `Preciso de apoio sobre a ocorrência de ${ligada.cultura} registada em ${formatarQuando(ligada.criadaEm)}.`,
      );
    }
  };

  const limparFormulario = () => {
    setAssunto('');
    setMensagemNova('');
    setOcorrenciaId(filtroOcorrencia ?? '');
    setTecnicoEmail('');
    setMostrarNovo(false);
  };

  const criar = async () => {
    const assuntoOk = assunto.trim();
    const mensagemOk = mensagemNova.trim();
    if (!ocorrenciaId || assuntoOk.length < ASSUNTO_MIN || mensagemOk.length < CORPO_MIN) return;
    setPendente(true);
    setErro(null);
    try {
      const criado = await criarPedidoApoio(token, {
        assunto: assuntoOk,
        mensagem: mensagemOk,
        ocorrenciaId,
        tecnicoEmail: tecnicoEmail || null,
      });
      setFiltroOcorrencia(ocorrenciaId);
      limparFormulario();
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

  const iniciarNovo = () => {
    if (proprias.length === 0) return;
    setSeleccionado(null);
    setMostrarNovo(true);
    if (filtroOcorrencia) setOcorrenciaId(filtroOcorrencia);
  };

  const podeResponder =
    !!seleccionado &&
    (seleccionado.autorEmail === email || (podeAtender && seleccionado.estado !== 'ENCERRADO'));

  const semOcorrencias = podeCriar && proprias.length === 0;
  const formPronto =
    !!ocorrenciaId &&
    assunto.trim().length >= ASSUNTO_MIN &&
    mensagemNova.trim().length >= CORPO_MIN;

  return (
    <section className="apoio-ecra" aria-labelledby={tituloId}>
      <header className="lista-cabeca">
        <div className="lista-cabeca-texto">
          <h1 id={tituloId} className="titulo">
            Pedidos de apoio
          </h1>
        </div>
        {podeCriar && !semOcorrencias ? (
          <button
            type="button"
            className={mostrarNovo ? 'secundario' : 'primario'}
            onClick={() => (mostrarNovo ? limparFormulario() : iniciarNovo())}
          >
            {mostrarNovo ? 'Fechar formulário' : 'Novo pedido'}
          </button>
        ) : null}
      </header>

      {!carregar && !semOcorrencias ? (
        <div className="apoio-resumo" role="group" aria-label="Resumo dos pedidos">
          <button
            type="button"
            className={filtroEstado === 'todos' ? 'apoio-chip apoio-chip-activo' : 'apoio-chip'}
            onClick={() => setFiltroEstado('todos')}
          >
            Todos <strong>{contagens.total}</strong>
          </button>
          <button
            type="button"
            className={filtroEstado === 'ABERTO' ? 'apoio-chip apoio-chip-activo' : 'apoio-chip'}
            onClick={() => setFiltroEstado('ABERTO')}
          >
            Abertos <strong>{contagens.ABERTO}</strong>
          </button>
          <button
            type="button"
            className={
              filtroEstado === 'EM_ATENDIMENTO' ? 'apoio-chip apoio-chip-activo' : 'apoio-chip'
            }
            onClick={() => setFiltroEstado('EM_ATENDIMENTO')}
          >
            Em atendimento <strong>{contagens.EM_ATENDIMENTO}</strong>
          </button>
          <button
            type="button"
            className={filtroEstado === 'ENCERRADO' ? 'apoio-chip apoio-chip-activo' : 'apoio-chip'}
            onClick={() => setFiltroEstado('ENCERRADO')}
          >
            Encerrados <strong>{contagens.ENCERRADO}</strong>
          </button>
          {podeAtender ? (
            <button
              type="button"
              className={filtroMeus ? 'apoio-chip apoio-chip-activo' : 'apoio-chip'}
              onClick={() => setFiltroMeus((atual) => !atual)}
            >
              Atribuídos a mim
            </button>
          ) : null}
        </div>
      ) : null}

      {ocorrenciaFiltro ? (
        <div className="apoio-filtro-ocorrencia">
          <div>
            <p className="apoio-ocorrencia-rotulo">A ver só esta ocorrência</p>
            <p>
              <strong>{ocorrenciaFiltro.cultura}</strong>
              {' · '}
              {ROTULO_STATUS_OCORRENCIA[ocorrenciaFiltro.status]}
              {' · '}
              {formatarQuando(ocorrenciaFiltro.criadaEm)}
            </p>
          </div>
          <button type="button" className="secundario" onClick={() => setFiltroOcorrencia(null)}>
            Limpar filtro
          </button>
        </div>
      ) : null}

      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : null}

      {semOcorrencias ? (
        <div className="apoio-vazio">
          <IconeApoio />
          <h2>Comece por uma ocorrência</h2>
          <p>
            Os pedidos de apoio ficam ligados a um caso do campo. Assim o técnico vê cultura,
            sintomas e estado da triagem.
          </p>
          {aoIrNovaOcorrencia ? (
            <button type="button" className="primario" onClick={aoIrNovaOcorrencia}>
              Registar ocorrência
            </button>
          ) : null}
        </div>
      ) : null}

      {mostrarNovo && podeCriar && !semOcorrencias ? (
        <form
          ref={formRef}
          className="apoio-novo"
          onSubmit={(evento) => {
            evento.preventDefault();
            void criar();
          }}
        >
          <header className="apoio-novo-cabeca">
            <h2>Novo pedido</h2>
            <p className="nota">Escolha a ocorrência e descreva a dúvida em poucas linhas.</p>
          </header>

          <fieldset className="apoio-ocorrencia-picker">
            <legend>Ocorrência</legend>
            <div className="apoio-ocorrencia-opcoes" role="radiogroup" aria-label="Ocorrência relacionada">
              {proprias.map((item) => {
                const activo = ocorrenciaId === item.id;
                return (
                  <label
                    key={item.id}
                    className={activo ? 'apoio-ocorrencia-opcao apoio-ocorrencia-opcao-activa' : 'apoio-ocorrencia-opcao'}
                  >
                    <input
                      type="radio"
                      name="ocorrencia-apoio"
                      value={item.id}
                      checked={activo}
                      onChange={() => escolherOcorrencia(item.id)}
                    />
                    <span className="apoio-ocorrencia-opcao-corpo">
                      <span className="apoio-ocorrencia-opcao-topo">
                        <strong>{item.cultura}</strong>
                        <span className={`selo estado-mini-${item.status.toLowerCase()}`}>
                          {ROTULO_STATUS_OCORRENCIA[item.status]}
                        </span>
                      </span>
                      <span className="meta">
                        {item.sintomas.map(rotuloSintoma).join(' · ') || 'Sem sintomas'}
                      </span>
                      <span className="meta">{formatarQuando(item.criadaEm)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {ocorrenciaEscolhida ? (
            <aside className="apoio-ocorrencia-ligada apoio-ocorrencia-preview">
              <p className="apoio-ocorrencia-rotulo">Contexto que o técnico vai ver</p>
              <p>
                <strong>{ocorrenciaEscolhida.cultura}</strong>
                {' · confiança '}
                {ocorrenciaEscolhida.confianca}%
                {' · '}
                {ROTULO_STATUS_OCORRENCIA[ocorrenciaEscolhida.status]}
              </p>
            </aside>
          ) : null}

          <label className="apoio-campo">
            <span>Técnico / agronómio (opcional)</span>
            <select
              value={tecnicoEmail}
              onChange={(evento) => setTecnicoEmail(evento.target.value)}
            >
              <option value="">Qualquer técnico disponível</option>
              {tecnicos.map((item) => (
                <option key={item.email} value={item.email}>
                  {(item.nome || item.email).trim()} · {ROTULO_PERFIL[item.perfil]}
                </option>
              ))}
            </select>
            {tecnicos.length === 0 ? (
              <span className="nota">Ainda não há técnicos na plataforma — o pedido fica aberto a qualquer um.</span>
            ) : (
              <span className="nota">Se escolher alguém, o pedido fica atribuído a essa pessoa.</span>
            )}
          </label>

          <label className="apoio-campo">
            <span>Assunto</span>
            <input
              value={assunto}
              maxLength={ASSUNTO_MAX}
              onChange={(evento) => setAssunto(evento.target.value)}
              placeholder="Ex.: Manchas no milho após chuva"
              required
            />
            <span className="apoio-contador">
              {assunto.trim().length}/{ASSUNTO_MAX}
            </span>
          </label>

          <label className="apoio-campo">
            <span>Mensagem</span>
            <textarea
              value={mensagemNova}
              maxLength={CORPO_MAX}
              rows={4}
              onChange={(evento) => setMensagemNova(evento.target.value)}
              placeholder="O que observou? Quando começou? Já tentou alguma medida?"
              required
            />
            <span className="apoio-contador">
              {mensagemNova.trim().length}/{CORPO_MAX}
            </span>
          </label>

          <div className="apoio-novo-accoes">
            <button type="button" className="secundario" onClick={limparFormulario} disabled={pendente}>
              Cancelar
            </button>
            <button type="submit" className="primario" disabled={pendente || !formPronto}>
              {pendente ? 'A enviar…' : 'Enviar pedido'}
            </button>
          </div>
        </form>
      ) : null}

      {!semOcorrencias ? (
        <div className="apoio-grelha">
          <div className="apoio-lista" aria-label="Lista de pedidos">
            <div className="apoio-lista-cabeca">
              <h2>Conversas</h2>
              <span className="meta">{pedidosVisiveis.length}</span>
            </div>
            {carregar ? (
              <div className="apoio-esqueleto" aria-busy="true" aria-label="A carregar pedidos">
                <span />
                <span />
                <span />
              </div>
            ) : pedidosVisiveis.length === 0 ? (
              <div className="apoio-vazio apoio-vazio-compacto">
                <IconeApoio />
                <h3>
                  {filtroOcorrencia || filtroEstado !== 'todos'
                    ? 'Nenhum pedido neste filtro'
                    : 'Ainda sem conversas'}
                </h3>
                <p>
                  {podeCriar
                    ? 'Abra um pedido a partir de uma ocorrência para falar com o técnico.'
                    : 'Quando um agricultor pedir apoio, a conversa aparece aqui.'}
                </p>
                {podeCriar && filtroEstado === 'todos' && !filtroOcorrencia ? (
                  <button type="button" className="primario" onClick={iniciarNovo}>
                    Novo pedido
                  </button>
                ) : null}
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
                        <span className="apoio-item-topo">
                          <span className={`apoio-estado apoio-estado-${item.estado.toLowerCase()}`}>
                            {ROTULO_ESTADO[item.estado]}
                          </span>
                          <time className="meta" dateTime={item.actualizadoEm}>
                            {formatarQuando(item.actualizadoEm)}
                          </time>
                        </span>
                        <strong>{item.assunto}</strong>
                        <span className="meta">
                          {ligada ? `${ligada.cultura}` : 'Sem ocorrência'}
                          {item.tecnicoEmail
                            ? ` · ${nomeTecnico(item.tecnicoEmail) ?? item.tecnicoEmail}`
                            : ' · Sem técnico'}
                          {podeAtender || perfil === 'ADMIN_SISTEMA'
                            ? ` · ${item.autorEmail}`
                            : ''}
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
              <div className="apoio-vazio apoio-vazio-compacto">
                <IconeApoio />
                <h3>Conversa</h3>
                <p>Seleccione um pedido à esquerda para ler e responder.</p>
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
                      {seleccionado.tecnicoEmail
                        ? ` · Técnico: ${nomeTecnico(seleccionado.tecnicoEmail) ?? seleccionado.tecnicoEmail}`
                        : ' · Sem técnico atribuído'}
                    </p>
                  </div>
                  {podeAtender ? (
                    <div className="apoio-accoes">
                      {seleccionado.estado !== 'EM_ATENDIMENTO' &&
                      seleccionado.estado !== 'ENCERRADO' ? (
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
                    <div className="apoio-ocorrencia-ligada-texto">
                      <p className="apoio-ocorrencia-rotulo">Ocorrência ligada</p>
                      {seleccionadoOcorrencia ? (
                        <>
                          <p>
                            <strong>{seleccionadoOcorrencia.cultura}</strong>
                            {' · '}
                            {ROTULO_STATUS_OCORRENCIA[seleccionadoOcorrencia.status]}
                            {' · '}
                            {seleccionadoOcorrencia.confianca}%
                          </p>
                          <p className="meta">
                            {seleccionadoOcorrencia.sintomas.map(rotuloSintoma).join(' · ') ||
                              'Sem sintomas'}
                            {' · '}
                            {formatarQuando(seleccionadoOcorrencia.criadaEm)}
                          </p>
                        </>
                      ) : (
                        <p className="nota">Detalhe indisponível nesta sessão.</p>
                      )}
                    </div>
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
                ) : null}

                <ol className="apoio-thread" ref={threadRef}>
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
                    <label className="apoio-campo">
                      <span>
                        {seleccionado.estado === 'ENCERRADO' && seleccionado.autorEmail === email
                          ? 'Reabrir com nova mensagem'
                          : 'A sua resposta'}
                      </span>
                      <textarea
                        value={resposta}
                        maxLength={CORPO_MAX}
                        rows={3}
                        onChange={(evento) => setResposta(evento.target.value)}
                        placeholder="Escreva a resposta…"
                        disabled={pendente}
                      />
                      <span className="apoio-contador">
                        {resposta.trim().length}/{CORPO_MAX}
                      </span>
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
                  <p className="nota apoio-encerrado">Este pedido está encerrado.</p>
                )}

                {seleccionado.estado === 'ENCERRADO' &&
                seleccionado.autorEmail === email &&
                seleccionado.tecnicoEmail &&
                !seleccionado.avaliacao ? (
                  <form
                    className="apoio-avaliacao"
                    onSubmit={(evento) => {
                      evento.preventDefault();
                      void enviarAvaliacao();
                    }}
                  >
                    <h3>Avaliar assistência</h3>
                    <p className="nota">
                      Classifique o técnico <strong translate="no">{seleccionado.tecnicoEmail}</strong>.
                    </p>
                    <div className="apoio-estrelas" role="radiogroup" aria-label="Estrelas">
                      {([1, 2, 3, 4, 5] as const).map((valor) => (
                        <button
                          key={valor}
                          type="button"
                          className={
                            estrelas >= valor ? 'estrela-botao estrela-botao-activo' : 'estrela-botao'
                          }
                          aria-label={`${valor} estrela${valor > 1 ? 's' : ''}`}
                          aria-pressed={estrelas === valor}
                          onClick={() => setEstrelas(valor)}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <label className="apoio-campo">
                      <span>Comentário (opcional)</span>
                      <textarea
                        value={comentarioAvaliacao}
                        maxLength={500}
                        rows={2}
                        onChange={(evento) => setComentarioAvaliacao(evento.target.value)}
                        placeholder="O que correu bem na assistência?"
                        disabled={pendente}
                      />
                    </label>
                    <button type="submit" className="primario" disabled={pendente || !estrelas}>
                      {pendente ? 'A guardar…' : 'Enviar avaliação'}
                    </button>
                  </form>
                ) : null}

                {seleccionado.avaliacao ? (
                  <aside className="apoio-avaliacao-feita">
                    <p className="apoio-ocorrencia-rotulo">Avaliação registada</p>
                    <p className="ranking-estrelas" aria-label={`${seleccionado.avaliacao.estrelas} estrelas`}>
                      {[1, 2, 3, 4, 5].map((valor) => (
                        <span
                          key={valor}
                          className={
                            valor <= seleccionado.avaliacao!.estrelas
                              ? 'estrela estrela-cheia'
                              : 'estrela'
                          }
                          aria-hidden="true"
                        >
                          ★
                        </span>
                      ))}
                      <strong>{seleccionado.avaliacao.estrelas}/5</strong>
                    </p>
                    {seleccionado.avaliacao.comentario ? (
                      <p className="meta">{seleccionado.avaliacao.comentario}</p>
                    ) : null}
                  </aside>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
