import { useEffect, useState } from 'react';
import { listarOcorrencias, type Ocorrencia } from './api';
import { EcraLogin } from './ecra-login';
import { EcraOcorrencia } from './ecra-ocorrencia';
import { EcraTecnico } from './ecra-tecnico';
import { limparSessao, lerSessao, type Sessao } from './sessao';

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

export function App() {
  const [sessao, setSessao] = useState<Sessao | null>(() => lerSessao());
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);

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

  function sair() {
    limparSessao();
    setSessao(null);
    setOcorrencias([]);
  }

  return (
    <div className="pagina">
      <header className="topo">
        {MARCA}
        {sessao ? (
          <div className="sessao">
            <span>
              {sessao.email}
              <small>{sessao.perfil}</small>
            </span>
            <button type="button" className="secundario" onClick={sair}>
              Sair
            </button>
          </div>
        ) : null}
      </header>
      <main>
        {sessao === null ? <EcraLogin aoEntrar={setSessao} /> : null}
        {sessao?.perfil === 'AGRICULTOR' ? (
          <EcraOcorrencia
            token={sessao.token}
            ocorrencias={ocorrencias}
            aoRegistar={(ocorrencia) => {
              setOcorrencias((atual) => [...atual, ocorrencia]);
            }}
          />
        ) : null}
        {sessao?.perfil === 'TECNICO' ? (
          <EcraTecnico
            token={sessao.token}
            ocorrencias={ocorrencias}
            aoValidar={(id) => {
              setOcorrencias((atual) =>
                atual.map((item) => (item.id === id ? { ...item, status: 'VALIDADA' } : item)),
              );
            }}
          />
        ) : null}
      </main>
    </div>
  );
}
