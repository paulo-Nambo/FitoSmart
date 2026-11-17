import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type Ref } from 'react';
import {
  enviarImagem,
  listarPedidosApoio,
  registarOcorrencia,
  type Diagnostico,
  type Ocorrencia,
  type Severidade,
} from './api';
import { CampoImagens, type CampoImagensHandle } from './campo-imagens';
import { CartaoOcorrencia, rotuloSeveridade, rotuloSintoma } from './cartao-ocorrencia';
import type { MenuId } from './barra-lateral';
import { exportarOcorrenciasCsv } from './exportar-csv';
import { filtrarPesquisa } from './filtrar-pesquisa';
import {
  BarraFiltro,
  contarEstados,
  filtrarEstado,
  mensagemVazia,
  porDataRecente,
  rotuloLista,
  useFiltroEstado,
} from './filtro-estado';
import { PainelEstatisticas } from './painel-estatisticas';
import { VistaMapaOcorrencias } from './vista-mapa-ocorrencias';

const CULTURAS = ['Milho', 'Mandioca', 'Feijão', 'Tomate'] as const;
const FICHA_BASE = ['manchas_amarelas', 'folhas_secas'] as const;
const LIMIAR_TRIAGEM = 60;
const LAT_INICIAL = '-25.96';
const LNG_INICIAL = '32.58';
const COORDENADA = new Intl.NumberFormat('pt', { maximumFractionDigits: 5 });
const PERCENTAGEM = new Intl.NumberFormat('pt');

const SINTOMAS = [
  { id: 'manchas_amarelas', rotulo: 'Manchas amarelas' },
  { id: 'folhas_secas', rotulo: 'Folhas secas' },
  { id: 'murcha', rotulo: 'Murcha' },
  { id: 'pragas_visiveis', rotulo: 'Pragas visíveis' },
] as const;

const SEVERIDADES: Severidade[] = [1, 2, 3, 4, 5];

const OPCOES_CULTURA = CULTURAS.map((item) => (
  <option key={item} value={item}>
    {item}
  </option>
));

interface EcraOcorrenciaProps {
  menu: MenuId;
  token: string;
  ocorrencias: Ocorrencia[];
  aoRegistar: (ocorrencia: Ocorrencia, mensagem?: string) => void;
  podeCriar?: boolean;
  podePedirApoio?: boolean;
  aoPedirApoio?: (ocorrenciaId: string) => void;
  destacarId?: string | null;
}

const ListaOcorrencias = memo(function ListaOcorrencias({
  token,
  ocorrencias,
  podePedirApoio = false,
  aoPedirApoio,
  destacarId = null,
}: {
  token: string;
  ocorrencias: Ocorrencia[];
  podePedirApoio?: boolean;
  aoPedirApoio?: (ocorrenciaId: string) => void;
  destacarId?: string | null;
}) {
  const { filtro, escolher } = useFiltroEstado();
  const [pesquisa, setPesquisa] = useState('');
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista');
  const [pedidosPorOcorrencia, setPedidosPorOcorrencia] = useState<Record<string, number>>({});
  const filtradasEstado = filtrarEstado(porDataRecente(ocorrencias), filtro);
  const visiveis = useMemo(() => {
    const base = filtrarPesquisa(filtradasEstado, pesquisa);
    if (!destacarId) return base;
    return [...base].sort((a, b) => Number(b.id === destacarId) - Number(a.id === destacarId));
  }, [filtradasEstado, pesquisa, destacarId]);
  const contagens = contarEstados(ocorrencias);

  useEffect(() => {
    let ativo = true;
    listarPedidosApoio(token)
      .then((dados) => {
        if (!ativo) return;
        const mapa: Record<string, number> = {};
        for (const pedido of dados.pedidos) {
          if (!pedido.ocorrenciaId) continue;
          mapa[pedido.ocorrenciaId] = (mapa[pedido.ocorrenciaId] ?? 0) + 1;
        }
        setPedidosPorOcorrencia(mapa);
      })
      .catch(() => {
        if (ativo) setPedidosPorOcorrencia({});
      });
    return () => {
      ativo = false;
    };
  }, [token, ocorrencias.length]);

  useEffect(() => {
    if (!destacarId) return;
    const alvo = document.getElementById(`ocorrencia-${destacarId}`);
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [destacarId, visiveis]);

  return (
    <section className="lista-ecra" aria-labelledby="ocorrencias-titulo">
      <header className="lista-cabeca">
        <div className="lista-cabeca-texto">
          <h1 id="ocorrencias-titulo" className="titulo">
            Ocorrências
          </h1>
          <p className="nota lista-total">{rotuloLista(visiveis.length, ocorrencias.length, filtro)}</p>
        </div>
        <div className="lista-cabeca-accoes">
          <div className="vista-toggle" role="group" aria-label="Vista das ocorrências">
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
            onClick={() => exportarOcorrenciasCsv(visiveis)}
          >
            Exportar CSV
          </button>
        </div>
      </header>
      <div className="lista-ferramentas lista-ferramentas-ext">
        <label className="lista-pesquisa">
          <span className="sr-only">Pesquisar ocorrências</span>
          <input
            type="search"
            value={pesquisa}
            onChange={(evento) => setPesquisa(evento.target.value)}
            placeholder="Pesquisar cultura, parcela, sintoma…"
            autoComplete="off"
          />
        </label>
        <BarraFiltro filtro={filtro} aoEscolher={escolher} contagens={contagens} />
      </div>
      {visiveis.length === 0 ? (
        <div className="lista-vazia-caixa">
          <p>{pesquisa.trim() ? 'Nenhuma ocorrência corresponde à pesquisa.' : mensagemVazia(filtro)}</p>
          {filtro !== 'todas' || pesquisa.trim() ? (
            <button
              type="button"
              className="secundario"
              onClick={() => {
                escolher('todas');
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
        <ul className="lista-ocorrencias">
          {visiveis.map((item) => (
            <li key={item.id} className="lista-linha">
              <CartaoOcorrencia
                token={token}
                ocorrencia={item}
                destacado={item.id === destacarId}
                pedidosApoio={pedidosPorOcorrencia[item.id] ?? 0}
                aoPedirApoio={podePedirApoio ? aoPedirApoio : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

export function EcraOcorrencia({
  menu,
  token,
  ocorrencias,
  aoRegistar,
  podeCriar = true,
  podePedirApoio = false,
  aoPedirApoio,
  destacarId = null,
}: EcraOcorrenciaProps) {
  return (
    <>
      <section hidden={menu !== 'painel'}>
        <h1 className="titulo">Painel</h1>
        {menu === 'painel' ? <PainelEstatisticas ocorrencias={ocorrencias} /> : null}
      </section>
      {podeCriar ? (
        <div hidden={menu !== 'nova'}>
          <FormularioOcorrencia
            token={token}
            aoRegistar={aoRegistar}
            activo={menu === 'nova'}
            aoPedirApoio={podePedirApoio ? aoPedirApoio : undefined}
          />
        </div>
      ) : null}
      <div hidden={menu !== 'ocorrencias'}>
        <ListaOcorrencias
          token={token}
          ocorrencias={ocorrencias}
          podePedirApoio={podePedirApoio}
          aoPedirApoio={aoPedirApoio}
          destacarId={destacarId}
        />
      </div>
    </>
  );
}

const SintomaOpcao = memo(function SintomaOpcao({
  id,
  rotulo,
  marcado,
  aoAlternar,
}: {
  id: string;
  rotulo: string;
  marcado: boolean;
  aoAlternar: (id: string) => void;
}) {
  return (
    <label className="chip-opcao">
      <input type="checkbox" name="sintomas" value={id} checked={marcado} onChange={() => aoAlternar(id)} />
      {rotulo}
    </label>
  );
});

function preverTriagem(sintomas: Set<string>) {
  if (sintomas.size === 0) return null;
  let coincidencias = 0;
  for (const sintoma of FICHA_BASE) {
    if (sintomas.has(sintoma)) coincidencias += 1;
  }
  const confianca = Math.round((coincidencias / FICHA_BASE.length) * 100);
  const status = confianca >= LIMIAR_TRIAGEM ? 'TRIADA' : 'ENCAMINHADA';
  return { confianca, status } as const;
}

const PrevisaoTriagem = memo(function PrevisaoTriagem({ sintomas }: { sintomas: Set<string> }) {
  const previsao = preverTriagem(sintomas);
  if (!previsao) {
    return <div id="previsao-triagem" className="sr-only" aria-live="polite" />;
  }

  const confianca = `${PERCENTAGEM.format(previsao.confianca)}\u00a0%`;

  return (
    <div className={`previsao estado-${previsao.status.toLowerCase()}`} id="previsao-triagem" aria-live="polite">
      <p>
        {previsao.status === 'TRIADA' ? (
          <>
            Confiança {confianca} · <span translate="no">TRIADA</span>
          </>
        ) : (
          <>
            Confiança {confianca} · <span translate="no">ENCAMINHADA</span> (abaixo de 60&nbsp;%)
          </>
        )}
      </p>
      <div className="progresso" aria-hidden="true">
        <span style={{ width: `${previsao.confianca}%` }} />
      </div>
    </div>
  );
});

interface CamposLocalHandle {
  ler(): { latitude: string; longitude: string };
  definir(latitude: string, longitude: string): void;
  focar(campo: 'latitude' | 'longitude'): void;
  sujo(): boolean;
  marcarLimpo(): void;
}

const CamposLocal = memo(function CamposLocal({
  ref,
  activo,
  campoErro,
  aoErro,
  aoLimparErro,
}: {
  ref?: Ref<CamposLocalHandle>;
  activo: boolean;
  campoErro: 'latitude' | 'longitude' | null;
  aoErro: (mensagem: string) => void;
  aoLimparErro: (campo: 'latitude' | 'longitude') => void;
}) {
  const [latitude, setLatitude] = useState(LAT_INICIAL);
  const [longitude, setLongitude] = useState(LNG_INICIAL);
  const [baseLat, setBaseLat] = useState(LAT_INICIAL);
  const [baseLng, setBaseLng] = useState(LNG_INICIAL);
  const [aLocalizar, setALocalizar] = useState(false);
  const [manual, setManual] = useState(false);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);
  const autoPedido = useRef(false);
  const montadoRef = useRef(true);
  const aoErroRef = useRef(aoErro);
  const aoLimparErroRef = useRef(aoLimparErro);
  aoErroRef.current = aoErro;
  aoLimparErroRef.current = aoLimparErro;

  useImperativeHandle(
    ref,
    () => ({
      ler: () => ({ latitude, longitude }),
      definir: (proximaLat, proximaLng) => {
        setLatitude(proximaLat);
        setLongitude(proximaLng);
      },
      focar: (campo) => {
        setManual(true);
        queueMicrotask(() => {
          (campo === 'latitude' ? latitudeRef : longitudeRef).current?.focus();
        });
      },
      sujo: () => latitude !== baseLat || longitude !== baseLng,
      marcarLimpo: () => {
        setBaseLat(latitude);
        setBaseLng(longitude);
      },
    }),
    [baseLat, baseLng, latitude, longitude],
  );

  const pedirPosicao = useCallback((silencioso: boolean) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setManual(true);
      if (!silencioso) {
        aoErroRef.current('Este dispositivo não partilha a posição. Indique a latitude e a longitude.');
      }
      return;
    }
    setALocalizar(true);
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        if (!montadoRef.current) return;
        const lat = posicao.coords.latitude.toFixed(5);
        const lng = posicao.coords.longitude.toFixed(5);
        setLatitude(lat);
        setLongitude(lng);
        setBaseLat(lat);
        setBaseLng(lng);
        setManual(false);
        aoLimparErroRef.current('latitude');
        aoLimparErroRef.current('longitude');
        setALocalizar(false);
      },
      () => {
        if (!montadoRef.current) return;
        setALocalizar(false);
        setManual(true);
        if (!silencioso) {
          aoErroRef.current('Não foi possível ler a posição. Indique a latitude e a longitude.');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!activo || autoPedido.current) return;
    autoPedido.current = true;
    pedirPosicao(true);
  }, [activo, pedirPosicao]);

  useEffect(() => {
    if (campoErro === 'latitude' || campoErro === 'longitude') setManual(true);
  }, [campoErro]);

  if (!manual) return null;

  return (
    <fieldset>
      <legend>Localização</legend>
      <div className="par">
        <div>
          <label htmlFor="latitude">Latitude</label>
          <input
            ref={latitudeRef}
            id="latitude"
            name="latitude"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="−25.96…"
            aria-invalid={campoErro === 'latitude'}
            aria-describedby={campoErro === 'latitude' ? 'erro-formulario' : undefined}
            value={latitude}
            onChange={(evento) => {
              aoLimparErro('latitude');
              setLatitude(evento.target.value);
            }}
          />
        </div>
        <div>
          <label htmlFor="longitude">Longitude</label>
          <input
            ref={longitudeRef}
            id="longitude"
            name="longitude"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="32.58…"
            aria-invalid={campoErro === 'longitude'}
            aria-describedby={campoErro === 'longitude' ? 'erro-formulario' : undefined}
            value={longitude}
            onChange={(evento) => {
              aoLimparErro('longitude');
              setLongitude(evento.target.value);
            }}
          />
        </div>
      </div>
      <button
        type="button"
        className="secundario localizar"
        onClick={() => pedirPosicao(false)}
        disabled={aLocalizar}
        aria-busy={aLocalizar}
      >
        {aLocalizar ? 'A obter posição…' : 'Tentar posição do dispositivo'}
      </button>
    </fieldset>
  );
});

const FormularioOcorrencia = memo(function FormularioOcorrencia({
  token,
  aoRegistar,
  activo,
  aoPedirApoio,
}: {
  token: string;
  aoRegistar: EcraOcorrenciaProps['aoRegistar'];
  activo: boolean;
  aoPedirApoio?: (ocorrenciaId: string) => void;
}) {
  const [cultura, setCultura] = useState<(typeof CULTURAS)[number]>('Milho');
  const [parcelaNome, setParcelaNome] = useState('');
  const [severidade, setSeveridade] = useState<Severidade>(3);
  const [sintomas, setSintomas] = useState(() => new Set<string>());
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [sintomasManuais, setSintomasManuais] = useState(false);
  const [aAnalisarFoto, setAAnalisarFoto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campoErro, setCampoErro] = useState<'sintomas' | 'latitude' | 'longitude' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ultimaOcorrenciaId, setUltimaOcorrenciaId] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const sintomasRef = useRef<HTMLFieldSetElement>(null);
  const alertaRef = useRef<HTMLParagraphElement>(null);
  const localRef = useRef<CamposLocalHandle>(null);
  const imagensRef = useRef<CampoImagensHandle>(null);

  const falhar = useCallback((campo: 'sintomas' | 'latitude' | 'longitude', mensagem: string) => {
    setCampoErro(campo);
    setErro(mensagem);
    if (campo === 'sintomas') sintomasRef.current?.querySelector('input')?.focus();
    else localRef.current?.focar(campo);
  }, []);

  const limparErro = useCallback(
    (campo: 'sintomas' | 'latitude' | 'longitude') => {
      if (campoErro === campo || campoErro === null) {
        setCampoErro(null);
        setErro(null);
      }
    },
    [campoErro],
  );

  const reportarErro = useCallback((mensagem: string) => {
    setCampoErro(null);
    setErro(mensagem);
  }, []);

  useEffect(() => {
    if (erro && campoErro === null) alertaRef.current?.focus();
  }, [erro, campoErro]);

  useEffect(() => {
    if (campoErro === 'sintomas' && sintomasManuais) {
      sintomasRef.current?.querySelector('input')?.focus();
    }
  }, [campoErro, sintomasManuais]);

  useEffect(() => {
    const avisar = (evento: BeforeUnloadEvent) => {
      if (
        sintomas.size === 0 &&
        !parcelaNome.trim() &&
        !localRef.current?.sujo() &&
        !imagensRef.current?.sujo()
      ) {
        return;
      }
      evento.preventDefault();
      evento.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [parcelaNome, sintomas]);

  const alternarSintoma = useCallback((id: string) => {
    limparErro('sintomas');
    setSintomas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }, [limparErro]);

  const aplicarDeteccao = useCallback(
    (detectados: string[], resultado: Diagnostico | null) => {
      limparErro('sintomas');
      const culturaOk = resultado?.culturaConfere !== false;
      setDiagnostico(resultado);
      if (!culturaOk) {
        setSintomas(new Set());
        setSintomasManuais(true);
        setErro(resultado?.alertaCultura ?? 'A fotografia não corresponde à cultura seleccionada.');
        return;
      }
      setSintomas(new Set(detectados));
      setSintomasManuais(detectados.length === 0 && !(resultado && resultado.confianca > 0));
    },
    [limparErro],
  );

  const aoAnalisarFoto = useCallback((activo: boolean) => {
    setAAnalisarFoto(activo);
    if (activo) {
      setErro(null);
      setCampoErro(null);
      setSintomasManuais(false);
      setDiagnostico(null);
    }
  }, []);

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setCampoErro(null);
    setAviso(null);

    if (aAnalisarFoto) {
      setErro('Aguarde o fim da análise da fotografia antes de submeter.');
      return;
    }

    const local = localRef.current?.ler() ?? { latitude: LAT_INICIAL, longitude: LNG_INICIAL };
    const lat = Number(local.latitude);
    const lng = Number(local.longitude);
    if (sintomas.size === 0) {
      setSintomasManuais(true);
      falhar(
        'sintomas',
        imagensRef.current?.sujo()
          ? 'A fotografia não mostrou um padrão claro. Marque os sintomas que vê na planta.'
          : 'Carregue uma fotografia da planta para o diagnóstico.',
      );
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      falhar('latitude', 'Indique uma latitude entre −90 e 90.');
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      falhar('longitude', 'Indique uma longitude entre −180 e 180.');
      return;
    }

    setAEnviar(true);
    try {
      const resposta = await registarOcorrencia(token, {
        cultura,
        sintomas: [...sintomas],
        latitude: lat,
        longitude: lng,
        parcelaNome: parcelaNome.trim() || null,
        referenciaId: diagnostico?.referenciaId ?? null,
        severidade,
      });
      let ocorrencia = resposta.ocorrencia;
      const fotos = imagensRef.current?.ler() ?? [];
      if (fotos.length > 0) {
        try {
          const imagens: string[] = [];
          for (const foto of fotos) {
            imagens.push(await enviarImagem(token, ocorrencia.id, foto.blob));
          }
          ocorrencia = { ...ocorrencia, imagens };
        } catch {
          setCampoErro(null);
          setErro('A ocorrência ficou registada, mas as fotografias não foram guardadas. Tente no próximo caso.');
        }
      }
      aoRegistar(ocorrencia, resposta.mensagem);
      setUltimaOcorrenciaId(ocorrencia.id);
      setAviso(resposta.mensagem ?? `Ocorrência triada com ${resposta.ocorrencia.confianca}\u00a0% de confiança.`);
      setSintomas(new Set());
      setDiagnostico(null);
      setSintomasManuais(false);
      setParcelaNome('');
      setSeveridade(3);
      localRef.current?.marcarLimpo();
      imagensRef.current?.limpar();
    } catch (falha) {
      setCampoErro(null);
      setErro(falha instanceof Error ? falha.message : 'Não foi possível registar. Tente novamente.');
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <form className="cartao form-ocorrencia" onSubmit={submeter} autoComplete="off" noValidate>
      <header className="form-cabeca">
        <h1 className="titulo">Nova ocorrência</h1>
      </header>

      <fieldset className="form-bloco">
        <legend>Identificação</legend>
        <div className="form-grelha form-grelha-2">
          <div className="form-campo">
            <label htmlFor="cultura">Cultura</label>
            <select
              id="cultura"
              name="cultura"
              autoComplete="off"
              value={cultura}
              onChange={(evento) => {
                const proxima = evento.target.value as (typeof CULTURAS)[number];
                setCultura(proxima);
                setDiagnostico(null);
                setSintomas(new Set());
                setSintomasManuais(false);
                setErro(null);
                void imagensRef.current?.reanalisar?.();
              }}
            >
              {OPCOES_CULTURA}
            </select>
          </div>
          <div className="form-campo">
            <label htmlFor="parcela">
              Parcela <span className="form-opcional">opcional</span>
            </label>
            <input
              id="parcela"
              name="parcela"
              type="text"
              maxLength={80}
              autoComplete="off"
              placeholder="Talhão Norte · Maputo"
              value={parcelaNome}
              onChange={(evento) => setParcelaNome(evento.target.value)}
            />
          </div>
        </div>
        <div className="form-campo form-campo-severidade">
          <span id="severidade-rotulo" className="form-rotulo">
            Severidade
          </span>
          <div className="severidade-escala" role="radiogroup" aria-labelledby="severidade-rotulo">
            {SEVERIDADES.map((grau) => (
              <label key={grau} className={severidade === grau ? 'severidade-opcao severidade-opcao-activa' : 'severidade-opcao'}>
                <input
                  type="radio"
                  name="severidade"
                  value={grau}
                  checked={severidade === grau}
                  onChange={() => setSeveridade(grau)}
                />
                <strong>{grau}</strong>
                <small>{rotuloSeveridade(grau)}</small>
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <CampoImagens
        ref={imagensRef}
        token={token}
        cultura={cultura}
        aoDetectar={aplicarDeteccao}
        aoAnalisar={aoAnalisarFoto}
        aoErro={reportarErro}
      />
      {aAnalisarFoto ? (
        <p className="nota form-analise" role="status" aria-live="polite">
          A analisar a fotografia… os sintomas aparecem automaticamente quando terminar.
        </p>
      ) : null}
      {diagnostico && diagnostico.culturaConfere === false && !aAnalisarFoto ? (
        <div className="sintomas-foto" aria-live="assertive">
          <div className="diagnostico diagnostico-hipotese diagnostico-cultura-erro">
            <p className="sintomas-foto-rotulo">Cultura e fotografia incompatíveis</p>
            <p className="diagnostico-praga">{diagnostico.praga}</p>
            <p className="diagnostico-acao">
              {diagnostico.alertaCultura ?? diagnostico.recomendacao}
            </p>
            <p className="nota">
              Altere a cultura no formulário ou carregue uma fotografia da cultura seleccionada
              ({cultura}).
            </p>
          </div>
        </div>
      ) : null}
      {diagnostico &&
      diagnostico.culturaConfere !== false &&
      diagnostico.confianca > 0 &&
      !sintomasManuais &&
      !aAnalisarFoto ? (
        <div className="sintomas-foto" aria-live="polite">
          <div
            className={`diagnostico${diagnostico.motor === 'fitosmart' ? ' diagnostico-local' : ''}${
              diagnostico.hipotese || diagnostico.confianca < 60 ? ' diagnostico-hipotese' : ''
            }`}
          >
            <p className="sintomas-foto-rotulo">
              {diagnostico.hipotese || diagnostico.confianca < 60
                ? 'Hipótese — por confirmar no talhão'
                : diagnostico.motor === 'fitosmart'
                  ? 'Hipótese local (a IA de visão não respondeu)'
                  : 'Diagnóstico inteligente'}
            </p>
            <p className="diagnostico-praga">
              {diagnostico.praga}
              <span className="diagnostico-confianca">
                {`${PERCENTAGEM.format(diagnostico.confianca)}\u00a0%`}
              </span>
            </p>
            {diagnostico.nomeCientifico ? (
              <p className="diagnostico-ciencia" translate="no">
                {diagnostico.nomeCientifico}
              </p>
            ) : null}
            {sintomas.size > 0 ? (
              <p className="sintomas-foto-lista">
                {[...sintomas].map((id) => rotuloSintoma(id)).join(' · ')}
              </p>
            ) : null}
            {diagnostico.resumo && diagnostico.resumo !== diagnostico.recomendacao ? (
              <p className="diagnostico-ciencia">{diagnostico.resumo}</p>
            ) : null}
            <p className="diagnostico-acao">{diagnostico.recomendacao}</p>
            {diagnostico.alternativas.length > 0 ? (
              <div className="diagnostico-alternativas">
                <p className="diagnostico-refs-rotulo">Outras causas possíveis</p>
                <ul>
                  {diagnostico.alternativas.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {diagnostico.imagensReferencia?.length ? (
              <div className="diagnostico-refs">
                <p className="diagnostico-refs-rotulo">Imagens de referência</p>
                <ul className="diagnostico-refs-lista">
                  {diagnostico.imagensReferencia.map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`Referência: ${diagnostico.praga}`} loading="lazy" decoding="async" />
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="diagnostico-refs-fonte">
                  Exemplos da biblioteca (não são a sua foto) · Commons / iNaturalist
                </p>
              </div>
            ) : null}
            <p className="diagnostico-motor">
              {diagnostico.motor === 'openepi'
                ? 'OpenEPI Crop Health (grátis)'
                : diagnostico.motor === 'plantnet'
                  ? 'Pl@ntNet Diseases (grátis)'
                  : diagnostico.motor === 'kindwise'
                    ? 'Kindwise Crop.health (grátis)'
                    : diagnostico.motor === 'ollama'
                      ? 'IA Ollama (local)'
                      : diagnostico.motor === 'gemini'
                        ? 'IA Gemini'
                        : 'Fallback FitoSmart — não identifica a praga'}
            </p>
          </div>
          <div className="diagnostico-acoes">
            <button type="button" className="secundario" onClick={() => setSintomasManuais(true)}>
              {diagnostico.hipotese || diagnostico.confianca < 60
                ? 'Rever sintomas e confirmar'
                : 'Corrigir sintomas'}
            </button>
          </div>
        </div>
      ) : null}
      {sintomasManuais && !aAnalisarFoto ? (
        <fieldset
          ref={sintomasRef}
          className="form-bloco"
          aria-invalid={campoErro === 'sintomas'}
          aria-describedby={campoErro === 'sintomas' ? 'erro-formulario previsao-triagem' : 'previsao-triagem'}
        >
          <legend>Sintomas</legend>
          <p className="nota form-bloco-ajuda">Marque o que observa na planta.</p>
          <div className="sintomas">
            {SINTOMAS.map((item) => (
              <SintomaOpcao key={item.id} id={item.id} rotulo={item.rotulo} marcado={sintomas.has(item.id)} aoAlternar={alternarSintoma} />
            ))}
          </div>
          <PrevisaoTriagem sintomas={sintomas} />
        </fieldset>
      ) : null}

      <CamposLocal
        ref={localRef}
        activo={activo}
        campoErro={campoErro === 'latitude' || campoErro === 'longitude' ? campoErro : null}
        aoErro={reportarErro}
        aoLimparErro={limparErro}
      />
      {erro ? (
        <p id="erro-formulario" ref={alertaRef} className="alerta" role="alert" tabIndex={-1}>
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <div className="sucesso apoio-pos-registo" role="status" aria-live="polite">
          <p>{aviso}</p>
          {aoPedirApoio && ultimaOcorrenciaId ? (
            <button
              type="button"
              className="secundario"
              onClick={() => aoPedirApoio(ultimaOcorrenciaId)}
            >
              Pedir apoio ao técnico sobre esta ocorrência
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        type="submit"
        className="primario enviar"
        disabled={aEnviar || aAnalisarFoto}
        aria-busy={aEnviar || aAnalisarFoto}
      >
        {aAnalisarFoto ? 'A analisar fotografia…' : aEnviar ? 'A enviar…' : 'Submeter ocorrência'}
      </button>
    </form>
  );
});
