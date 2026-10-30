import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from 'react';
import { enviarImagem, registarOcorrencia, type Diagnostico, type Ocorrencia } from './api';
import { CampoImagens, type CampoImagensHandle } from './campo-imagens';
import { CartaoOcorrencia, rotuloSintoma } from './cartao-ocorrencia';
import type { MenuId } from './barra-lateral';
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
}

const ListaOcorrencias = memo(function ListaOcorrencias({
  token,
  ocorrencias,
}: {
  token: string;
  ocorrencias: Ocorrencia[];
}) {
  const { filtro, escolher } = useFiltroEstado();
  const visiveis = filtrarEstado(porDataRecente(ocorrencias), filtro);
  const contagens = contarEstados(ocorrencias);

  return (
    <section className="cartao lista">
      <header className="lista-cabeca">
        <h1 className="titulo">Ocorrências</h1>
        <p className="nota lista-total">{rotuloLista(visiveis.length, ocorrencias.length, filtro)}</p>
      </header>
      <BarraFiltro filtro={filtro} aoEscolher={escolher} contagens={contagens} />
      {visiveis.length === 0 ? (
        <p className="lista-vazia">{mensagemVazia(filtro)}</p>
      ) : (
        <ul>
          {visiveis.map((item) => (
            <li key={item.id}>
              <CartaoOcorrencia token={token} ocorrencia={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

export function EcraOcorrencia({ menu, token, ocorrencias, aoRegistar }: EcraOcorrenciaProps) {
  return (
    <>
      <section hidden={menu !== 'painel'}>
        <h1 className="titulo">Painel</h1>
        {menu === 'painel' ? <PainelEstatisticas ocorrencias={ocorrencias} /> : null}
      </section>
      <div hidden={menu !== 'nova'}>
        <FormularioOcorrencia token={token} aoRegistar={aoRegistar} activo={menu === 'nova'} />
      </div>
      <div hidden={menu !== 'ocorrencias'}>
        <ListaOcorrencias token={token} ocorrencias={ocorrencias} />
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
}: {
  token: string;
  aoRegistar: EcraOcorrenciaProps['aoRegistar'];
  activo: boolean;
}) {
  const [cultura, setCultura] = useState<(typeof CULTURAS)[number]>('Milho');
  const [sintomas, setSintomas] = useState(() => new Set<string>());
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [sintomasManuais, setSintomasManuais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campoErro, setCampoErro] = useState<'sintomas' | 'latitude' | 'longitude' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
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
      if (sintomas.size === 0 && !localRef.current?.sujo() && !imagensRef.current?.sujo()) return;
      evento.preventDefault();
      evento.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sintomas]);

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
      setSintomas(new Set(detectados));
      setDiagnostico(resultado);
      setSintomasManuais(detectados.length === 0 && !(resultado && resultado.confianca > 0));
    },
    [limparErro],
  );

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setCampoErro(null);
    setAviso(null);

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
      setAviso(resposta.mensagem ?? `Ocorrência triada com ${resposta.ocorrencia.confianca}\u00a0% de confiança.`);
      setSintomas(new Set());
      setDiagnostico(null);
      setSintomasManuais(false);
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
    <form className="cartao" onSubmit={submeter} autoComplete="off" noValidate>
      <h1 className="titulo">Nova ocorrência</h1>
      <label htmlFor="cultura">Cultura</label>
      <select
        id="cultura"
        name="cultura"
        autoComplete="off"
        value={cultura}
        onChange={(evento) => setCultura(evento.target.value as (typeof CULTURAS)[number])}
      >
        {OPCOES_CULTURA}
      </select>
      <CampoImagens
        ref={imagensRef}
        token={token}
        cultura={cultura}
        aoDetectar={aplicarDeteccao}
        aoErro={reportarErro}
      />
      {diagnostico && diagnostico.confianca > 0 && !sintomasManuais ? (
        <div className="sintomas-foto" aria-live="polite">
          <div className={`diagnostico${diagnostico.motor === 'fitosmart' ? ' diagnostico-local' : ''}`}>
            <p className="sintomas-foto-rotulo">
              {diagnostico.motor === 'fitosmart'
                ? 'Hipótese local (a IA de visão não respondeu)'
                : 'Diagnóstico inteligente'}
            </p>
            <p className="diagnostico-praga">
              {diagnostico.praga}
              {diagnostico.motor !== 'fitosmart' ? (
                <span className="diagnostico-confianca">
                  {`${PERCENTAGEM.format(diagnostico.confianca)}\u00a0%`}
                </span>
              ) : null}
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
                  Exemplos da biblioteca para a praga indicada (não são a sua foto) · Commons / iNaturalist
                </p>
              </div>
            ) : null}
            <p className="diagnostico-motor">
              {diagnostico.motor === 'openepi'
                ? 'OpenEPI Crop Health (grátis)'
                : diagnostico.motor === 'ollama'
                  ? 'IA Ollama (local)'
                  : diagnostico.motor === 'gemini'
                    ? 'IA Gemini'
                    : 'Fallback FitoSmart — não identifica a praga'}
            </p>
          </div>
          <button type="button" className="ligacao sintomas-foto-corrigir" onClick={() => setSintomasManuais(true)}>
            Corrigir sintomas
          </button>
        </div>
      ) : null}
      {sintomasManuais ? (
        <fieldset
          ref={sintomasRef}
          aria-invalid={campoErro === 'sintomas'}
          aria-describedby={campoErro === 'sintomas' ? 'erro-formulario previsao-triagem' : 'previsao-triagem'}
        >
          <legend>Sintomas</legend>
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
        <p className="sucesso" role="status" aria-live="polite">
          {aviso}
        </p>
      ) : null}
      <button type="submit" className="primario enviar" disabled={aEnviar} aria-busy={aEnviar}>
        {aEnviar ? 'A enviar…' : 'Submeter ocorrência'}
      </button>
    </form>
  );
});
