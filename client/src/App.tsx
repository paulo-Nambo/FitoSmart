import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { listarOcorrencias, type Ocorrencia } from './api';
import { EcraLogin } from './ecra-login';
import { limparSessao, lerSessao, type Sessao } from './sessao';
import { useInactividade } from './use-inactividade';

const importarOcorrencia = () => import('./ecra-ocorrencia');
const importarTecnico = () => import('./ecra-tecnico');

const EcraOcorrencia = lazy(() => importarOcorrencia().then((modulo) => ({ default: modulo.EcraOcorrencia })));
const EcraTecnico = lazy(() => importarTecnico().then((modulo) => ({ default: modulo.EcraTecnico })));

const RESERVA = <p className="nota">A carregar…</p>;

const MARCA = (
  <div className="marca">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="#1f6b45" />
      <path d="M24 36c-8-6-12-12-12-18a8 8 0 0 1 14-5 8 8 0 0 1 14 5c0 6-4 12-12 18z" fill="#f3efe4" />
      <path d="M24 34V16" stroke="#1f6b45" strokeWidth="2" />
    </svg>
    <div>
      <p className="sigla">UEM · Fitossanidade</p>
      <strong>FitoSmart</strong>
    </div>
  </div>
);

function preverEcra(perfil: Sessao['perfil']) {
  if (perfil === 'AGRICULTOR') void importarOcorrencia();
  else void importarTecnico();
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
  const autenticado = sessao !== null;

  const expirar = useCallback(() => {
    limparSessao();
    window.location.assign('/?idle=1');
  }, []);

  useInactividade(autenticado, expirar);

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

  const validar = useCallback((id: string) => {
    setOcorrencias((atual) => atual.map((item) => (item.id === id ? { ...item, status: 'VALIDADA' } : item)));
  }, []);

  if (sessao === null) {
    return <EcraLogin aoEntrar={setSessao} aoPrever={preverEcra} />;
  }

  return (
    <div className="pagina">
      <header className="topo">
        {MARCA}
        <div className="sessao">
          <span>
            {sessao.email}
            <small>{sessao.perfil}</small>
          </span>
          <button type="button" className="secundario" onClick={sair}>
            Sair
          </button>
        </div>
      </header>
      <main>
        <Suspense fallback={RESERVA}>
          {sessao.perfil === 'AGRICULTOR' ? (
            <EcraOcorrencia token={sessao.token} ocorrencias={ocorrencias} aoRegistar={registar} />
          ) : (
            <EcraTecnico token={sessao.token} ocorrencias={ocorrencias} aoValidar={validar} />
          )}
        </Suspense>
      </main>
    </div>
  );
}
