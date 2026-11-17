import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { entrar } from './api';
import {
  carregarPrevisaoSemanaMaputo,
  LOCAL_PREVISAO,
  PREVISAO_RESERVA,
  type DiaPrevisao,
} from './previsao-tempo';
import { guardarSessao, type Sessao } from './sessao';
import { MINUTOS_INACTIVIDADE } from './use-inactividade';

function faixaStyle(minima: number, maxima: number): CSSProperties {
  return {
    '--min': `${Math.max(0, Math.min(100, ((minima + 5) / 45) * 100))}%`,
    '--max': `${Math.max(0, Math.min(100, ((maxima + 5) / 45) * 100))}%`,
  } as CSSProperties;
}

const MARCA = (
  <div className="acesso-logotipo">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="acesso-marca-fundo" x1="6" y1="2" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2a9a5c" />
          <stop offset="1" stopColor="#0f3d28" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#acesso-marca-fundo)" />
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
      <strong>FitoSmart</strong>
      <p>Alerta precoce fitossanitário</p>
    </div>
  </div>
);

const DECOR = (
  <>
    <div className="acesso-brilho" aria-hidden="true" />
    <div className="acesso-grelha" aria-hidden="true" />
  </>
);

const LIGACAO_SEGURA = (
  <p className="acesso-segura">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        d="M12 3 5 6v6c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="m8.5 12 2.4 2.4 4.6-5" />
    </svg>
    Ligação segura e encriptada
  </p>
);

const ICONE_EMAIL = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="acesso-icone">
    <rect x="3.5" y="6" width="17" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path fill="none" stroke="currentColor" strokeWidth="1.8" d="m4 7 8 6 8-6" />
  </svg>
);

const ICONE_CADEADO = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="acesso-icone">
    <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M8 10V8a4 4 0 0 1 8 0v2" />
  </svg>
);

const ICONE_VER = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const ICONE_OCULTAR = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M3 4 20 20M9.5 9.7A3 3 0 0 0 14 14.2" />
    <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M6.2 6.8C4 8.3 2.4 10.4 2 12c1.2 4 5.2 7 10 7 1.6 0 3.1-.3 4.4-.9M10 5.1A10 10 0 0 1 12 5c4.8 0 8.8 3 10 7-.4.9-1 1.8-1.7 2.6" />
  </svg>
);

const ICONE_ALERTA = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M12 8v5" />
    <circle cx="12" cy="16.5" r="0.8" fill="currentColor" />
  </svg>
);

function avisoInactividade(): string {
  if (new URLSearchParams(window.location.search).get('idle') !== '1') return '';
  return `Sessão terminada por inactividade (${MINUTOS_INACTIVIDADE} minutos sem uso). Inicie sessão novamente.`;
}

interface EcraLoginProps {
  aoEntrar: (sessao: Sessao) => void;
  aoPrever: (perfil: Sessao['perfil']) => void;
}

export function EcraLogin({ aoEntrar, aoPrever }: EcraLoginProps) {
  return (
    <div className="acesso">
      <a className="saltar" href="#conteudo">
        Saltar para o conteúdo principal
      </a>
      <main id="conteudo" className="acesso-formulario">
        <div className="acesso-movel">{MARCA}</div>
        <FormularioLogin aoEntrar={aoEntrar} aoPrever={aoPrever} />
      </main>
      <aside className="acesso-marca" aria-label="Previsão do tempo e marca FitoSmart">
        {DECOR}
        <header className="acesso-cabecalho">{MARCA}</header>
        <Destaques />
      </aside>
    </div>
  );
}

function FormularioLogin({ aoEntrar, aoPrever }: EcraLoginProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState(avisoInactividade);
  const [aEnviar, setAEnviar] = useState(false);
  const erroRef = useRef<HTMLDivElement>(null);
  const focarErro = useRef(false);

  useEffect(() => {
    if (!erro || !focarErro.current) return;
    focarErro.current = false;
    erroRef.current?.focus();
  }, [erro]);

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    if (!email.includes('@')) {
      focarErro.current = true;
      setErro('O email precisa de incluir @.');
      return;
    }
    if (senha.length < 6) {
      focarErro.current = true;
      setErro('A senha precisa de pelo menos 6 caracteres.');
      return;
    }
    setAEnviar(true);
    try {
      const sessao = await entrar(email, senha);
      aoPrever(sessao.perfil);
      guardarSessao(sessao);
      if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
      aoEntrar(sessao);
    } catch (falha) {
      focarErro.current = true;
      setErro(falha instanceof Error ? falha.message : 'Falha no login');
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <div className="acesso-caixa">
      <h1>Acesso ao Sistema</h1>
      <form onSubmit={submeter} aria-describedby={erro ? 'login-erro' : undefined}>
        <label htmlFor="email">Email</label>
        <div className="acesso-campo">
          {ICONE_EMAIL}
          <input
            id="email"
            name="username"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nome@uem.mz"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            required
          />
        </div>
        <label htmlFor="senha">Senha</label>
        <div className="acesso-campo">
          {ICONE_CADEADO}
          <input
            id="senha"
            name="password"
            type={mostrarSenha ? 'text' : 'password'}
            autoComplete="current-password"
            spellCheck={false}
            placeholder="Introduza a senha…"
            minLength={6}
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            required
          />
          <button
            type="button"
            className="olho"
            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={mostrarSenha}
            onClick={() => setMostrarSenha((visivel) => !visivel)}
          >
            {mostrarSenha ? ICONE_OCULTAR : ICONE_VER}
          </button>
        </div>
        {LIGACAO_SEGURA}
        {erro ? (
          <div id="login-erro" ref={erroRef} tabIndex={-1} className="acesso-alerta" role="alert">
            {ICONE_ALERTA}
            <p>{erro}</p>
          </div>
        ) : null}
        <button type="submit" className="primario entrar" disabled={aEnviar} aria-busy={aEnviar}>
          {aEnviar ? 'A autenticar…' : 'Entrar no Sistema'}
          {aEnviar ? null : <span aria-hidden="true">→</span>}
        </button>
        <p className="nota acesso-ajuda-senha">
          Para alterar a senha, entre na conta e use <strong>Alterar senha</strong> no menu do perfil.
        </p>
      </form>
    </div>
  );
}

function Destaques() {
  const [dias, setDias] = useState<DiaPrevisao[] | null>(null);
  const aCarregar = dias === null;
  const lista = dias ?? [];
  const hoje = lista.find((dia) => dia.eHoje) ?? lista[0];

  useEffect(() => {
    const controlo = new AbortController();
    carregarPrevisaoSemanaMaputo(controlo.signal)
      .then(setDias)
      .catch(() => {
        if (!controlo.signal.aborted) setDias([PREVISAO_RESERVA]);
      });
    return () => controlo.abort();
  }, []);

  return (
    <div
      className="destaques"
      role="region"
      aria-label={`Previsão semanal do tempo em ${LOCAL_PREVISAO}`}
      aria-busy={aCarregar}
    >
      <div className="destaques-topo">
        <p>Previsão semanal</p>
      </div>
      <div className="destaque-cartao">
        <div
          className="destaque-painel destaque-tempo"
          aria-label={hoje ? `Semana em ${LOCAL_PREVISAO}. Hoje: ${hoje.title}` : `Semana em ${LOCAL_PREVISAO}`}
        >
          <span className="destaque-tipo">{aCarregar ? 'A carregar…' : `${LOCAL_PREVISAO} · 7 dias`}</span>
          {hoje?.temperatura !== null && hoje?.temperatura !== undefined ? (
            <p className="destaque-temp" aria-hidden="true">
              {Math.round(hoje.temperatura)}
              <span>°C</span>
            </p>
          ) : null}
          {hoje ? <p className="destaque-titulo">{hoje.title}</p> : null}
          <ul className="destaque-semana">
            {lista.map((dia) => (
              <li key={dia.id} className={dia.eHoje ? 'destaque-semana-dia e-hoje' : 'destaque-semana-dia'}>
                <span className="destaque-semana-nome">{dia.kind}</span>
                <span className="destaque-semana-condicao">{dia.title}</span>
                {dia.minima !== null && dia.maxima !== null ? (
                  <span
                    className="destaque-semana-faixa"
                    aria-label={`Mínima ${Math.round(dia.minima)} graus, máxima ${Math.round(dia.maxima)} graus`}
                  >
                    <span>{Math.round(dia.minima)}°</span>
                    <span className="destaque-faixa-barra" aria-hidden="true">
                      <i style={faixaStyle(dia.minima, dia.maxima)} />
                    </span>
                    <span>{Math.round(dia.maxima)}°</span>
                  </span>
                ) : (
                  <span className="destaque-semana-faixa destaque-semana-faixa-vazia">—</span>
                )}
              </li>
            ))}
          </ul>
          <p className="destaque-meta">
            {LOCAL_PREVISAO} · Open-Meteo
          </p>
        </div>
      </div>
    </div>
  );
}
