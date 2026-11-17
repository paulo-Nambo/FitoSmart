import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { listarOcorrencias, type Ocorrencia } from './api';
import {
  BarraLateral,
  eMenuPermitido,
  lerMenu,
  lerParametroUrl,
  urlDoMenu,
  type MenuId,
} from './barra-lateral';
import { EcraLogin } from './ecra-login';
import { FormularioPerfil } from './formulario-perfil';
import { FormularioAlterarSenha } from './formulario-senha';
import {
  podeConfigurar,
  podeCriarPedidoApoio,
  podeGerirContas,
  podeRegistarOcorrencia,
  podeUsarPedidosApoio,
  podeValidar,
  type Perfil,
} from './perfis';
import { guardarSessao, limparSessao, lerSessao, type Sessao } from './sessao';
import { useInactividade } from './use-inactividade';

type DialogoConta = 'perfil' | 'senha' | null;

const importarOcorrencia = () => import('./ecra-ocorrencia');
const importarTecnico = () => import('./ecra-tecnico');
const importarAcesso = () => import('./ecra-acesso');
const importarConfig = () => import('./ecra-config');
const importarTempo = () => import('./ecra-tempo');
const importarApoio = () => import('./ecra-apoio');

const EcraOcorrencia = lazy(() => importarOcorrencia().then((modulo) => ({ default: modulo.EcraOcorrencia })));
const EcraTecnico = lazy(() => importarTecnico().then((modulo) => ({ default: modulo.EcraTecnico })));
const EcraAcesso = lazy(() => importarAcesso().then((modulo) => ({ default: modulo.EcraAcesso })));
const EcraConfig = lazy(() => importarConfig().then((modulo) => ({ default: modulo.EcraConfig })));
const EcraTempo = lazy(() => importarTempo().then((modulo) => ({ default: modulo.EcraTempo })));
const EcraApoio = lazy(() => importarApoio().then((modulo) => ({ default: modulo.EcraApoio })));

const RESERVA = <p className="nota">A carregar…</p>;

const MARCA = (
  <div className="marca">
    <svg className="marca-simbolo" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <defs>
        <linearGradient id="marca-fundo" x1="6" y1="2" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2a9a5c" />
          <stop offset="1" stopColor="#0f3d28" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#marca-fundo)" />
      <path
        d="M24 36.5c-7-5.2-11-11-11-16.8C13 13.5 17.2 9.5 22.2 9.5c1.9 0 3.6.7 4.8 1.8 1.2-1.1 2.9-1.8 4.8-1.8 5 0 9.2 4 9.2 10.2 0 5.8-4 11.6-11 16.8L24 39.5Z"
        fill="#f3faf6"
      />
      <path d="M24 34V14.8" stroke="#1a7a4c" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M24 21.5c2.8-1.6 5-3.8 6.2-6.4" stroke="#1a7a4c" strokeWidth="1.7" strokeLinecap="round" fill="none" opacity="0.5" />
      <circle cx="34.8" cy="13.2" r="3.4" fill="#8ef0b8" />
      <circle cx="34.8" cy="13.2" r="1.4" fill="#0f3d28" />
    </svg>
    <div>
      <strong translate="no">FitoSmart</strong>
      <span className="marca-sub">Fitossanidade</span>
    </div>
  </div>
);

function preverEcra(perfil: Perfil) {
  if (podeGerirContas(perfil)) void importarAcesso();
  if (podeConfigurar(perfil)) void importarConfig();
  if (podeValidar(perfil)) void importarTecnico();
  if (podeUsarPedidosApoio(perfil)) void importarApoio();
  if (podeRegistarOcorrencia(perfil) || perfil === 'VISUALIZADOR' || perfil === 'ADMIN_SISTEMA') {
    void importarOcorrencia();
  }
}

function preverAcesso() {
  void importarAcesso();
}

function sessaoInicial(): Sessao | null {
  if (new URLSearchParams(window.location.search).get('idle') === '1') {
    limparSessao();
    return null;
  }
  return lerSessao();
}

export function App() {
  const [sessao, setSessao] = useState<Sessao | null>(sessaoInicial);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [menu, setMenu] = useState<MenuId>(() => lerMenu(sessaoInicial()?.perfil ?? 'AGRICULTOR'));
  const [dialogo, setDialogo] = useState<DialogoConta>(null);
  const autenticado = sessao !== null;
  const dialogoRef = useRef<HTMLDivElement>(null);
  const dialogoId = useId();

  const expirar = useCallback(() => {
    limparSessao();
    window.location.assign('/?idle=1');
  }, []);

  useInactividade(autenticado, expirar);

  useEffect(() => {
    if (!dialogo) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const alvo =
      dialogoRef.current?.querySelector<HTMLElement>('input:not([readonly])') ??
      dialogoRef.current?.querySelector<HTMLElement>('button, input');
    alvo?.focus();
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setDialogo(null);
    };
    document.addEventListener('keydown', fechar);
    return () => {
      document.removeEventListener('keydown', fechar);
      anterior?.focus();
    };
  }, [dialogo]);

  useEffect(() => {
    if (!sessao) return;
    const perfil = sessao.perfil;
    const aplicarMenu = (proximo: MenuId) => {
      setMenu(proximo);
      const url = urlDoMenu(proximo);
      if (url !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, '', url);
      }
    };
    aplicarMenu(lerMenu(perfil));
    const sincronizar = () => aplicarMenu(lerMenu(perfil));
    window.addEventListener('popstate', sincronizar);
    return () => window.removeEventListener('popstate', sincronizar);
  }, [sessao]);

  useEffect(() => {
    const token = sessao?.token;
    if (!token) return;
    let ativo = true;
    listarOcorrencias(token)
      .then((dados) => {
        if (ativo) setOcorrencias(dados.ocorrencias);
      })
      .catch(() => {
        if (!ativo) return;
        limparSessao();
        setSessao(null);
        setOcorrencias([]);
      });
    return () => {
      ativo = false;
    };
  }, [sessao?.token]);

  const sair = useCallback(() => {
    limparSessao();
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
    setSessao(null);
    setOcorrencias([]);
  }, []);

  const registar = useCallback((ocorrencia: Ocorrencia) => {
    setOcorrencias((atual) => [...atual, ocorrencia]);
  }, []);

  const validar = useCallback((ocorrencia: Ocorrencia) => {
    setOcorrencias((atual) =>
      atual.map((item) => (item.id === ocorrencia.id ? { ...item, ...ocorrencia, status: 'VALIDADA' } : item)),
    );
  }, []);

  const escolherMenu = useCallback(
    (proximo: MenuId, extras?: Record<string, string | null | undefined>) => {
      if (!sessao || !eMenuPermitido(sessao.perfil, proximo)) return;
      setMenu(proximo);
      const url = urlDoMenu(proximo, extras);
      if (url !== `${window.location.pathname}${window.location.search}`) {
        window.history.pushState(null, '', url);
      }
    },
    [sessao],
  );

  const pedirApoio = useCallback(
    (ocorrenciaId: string) => {
      escolherMenu('apoio', { ocorrencia: ocorrenciaId });
    },
    [escolherMenu],
  );

  const verOcorrencia = useCallback(
    (ocorrenciaId: string) => {
      escolherMenu('ocorrencias', { destacar: ocorrenciaId });
    },
    [escolherMenu],
  );

  const ocorrenciaApoio = menu === 'apoio' ? lerParametroUrl('ocorrencia') : null;
  const destacarOcorrencia = menu === 'ocorrencias' ? lerParametroUrl('destacar') : null;

  if (sessao === null) {
    return <EcraLogin aoEntrar={setSessao} aoPrever={preverEcra} />;
  }

  return (
    <div className="aplicacao">
      <a className="saltar" href="#conteudo">
        Saltar para o conteúdo principal
      </a>
      <BarraLateral
        marca={MARCA}
        perfil={sessao.perfil}
        email={sessao.email}
        nome={sessao.nome}
        organizacao={sessao.organizacao}
        menu={menu}
        aoEscolher={escolherMenu}
        aoPreverAcesso={preverAcesso}
        aoEditarPerfil={() => setDialogo('perfil')}
        aoAlterarSenha={() => setDialogo('senha')}
        aoSair={sair}
      />
      <main id="conteudo" className="pagina">
        <Suspense fallback={RESERVA}>
          {menu === 'tempo' ? (
            <EcraTempo />
          ) : menu === 'acesso' && podeGerirContas(sessao.perfil) ? (
            <EcraAcesso token={sessao.token} emailSessao={sessao.email} />
          ) : menu === 'config' && podeConfigurar(sessao.perfil) ? (
            <EcraConfig token={sessao.token} />
          ) : menu === 'fila' && podeValidar(sessao.perfil) ? (
            <EcraTecnico menu={menu} token={sessao.token} ocorrencias={ocorrencias} aoValidar={validar} />
          ) : menu === 'apoio' && podeUsarPedidosApoio(sessao.perfil) ? (
            <EcraApoio
              token={sessao.token}
              email={sessao.email}
              perfil={sessao.perfil}
              ocorrencias={ocorrencias}
              ocorrenciaInicial={ocorrenciaApoio}
              aoVerOcorrencia={verOcorrencia}
              aoIrNovaOcorrencia={() => escolherMenu('nova')}
            />
          ) : (
            <EcraOcorrencia
              menu={
                menu === 'acesso' || menu === 'config' || menu === 'fila' || menu === 'apoio'
                  ? 'painel'
                  : menu
              }
              token={sessao.token}
              ocorrencias={ocorrencias}
              aoRegistar={registar}
              podeCriar={podeRegistarOcorrencia(sessao.perfil)}
              podePedirApoio={podeUsarPedidosApoio(sessao.perfil) && podeCriarPedidoApoio(sessao.perfil)}
              aoPedirApoio={pedirApoio}
              destacarId={destacarOcorrencia}
            />
          )}
        </Suspense>
      </main>
      {dialogo ? (
        <div
          className="conta-dialogo"
          role="presentation"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setDialogo(null);
          }}
        >
          <div
            ref={dialogoRef}
            className="conta-dialogo-caixa"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogoId}
          >
            {dialogo === 'perfil' ? (
              <FormularioPerfil
                token={sessao.token}
                email={sessao.email}
                perfil={sessao.perfil}
                nomeInicial={sessao.nome}
                organizacaoInicial={sessao.organizacao}
                tituloId={dialogoId}
                aoCancelar={() => setDialogo(null)}
                aoSucesso={({ nome, organizacao }) => {
                  const proxima: Sessao = { ...sessao, nome, organizacao };
                  guardarSessao(proxima);
                  setSessao(proxima);
                  window.setTimeout(() => setDialogo(null), 900);
                }}
              />
            ) : (
              <FormularioAlterarSenha
                emailInicial={sessao.email}
                emailFixo
                token={sessao.token}
                titulo="Alterar senha"
                tituloId={dialogoId}
                variante="ficha"
                aoCancelar={() => setDialogo(null)}
                aoSucesso={() => {
                  window.setTimeout(() => setDialogo(null), 1200);
                }}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
