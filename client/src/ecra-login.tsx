import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { entrar } from './api';
import { guardarSessao, type Sessao } from './sessao';
import { MINUTOS_INACTIVIDADE } from './use-inactividade';

const INTERVALO_DESTAQUE_MS = 6500;
const ANO = new Date().getFullYear();

const CONTAS_DEMO = [
  { email: 'agricultor@uem.mz', senha: '123456', rotulo: 'Agricultor', perfil: 'AGRICULTOR' },
  { email: 'tecnico@uem.mz', senha: '123456', rotulo: 'Técnico', perfil: 'TECNICO' },
] as const;

const DESTAQUES = [
  {
    id: 'triagem',
    kind: 'Triagem',
    title: 'Decisão ainda no campo',
    description: 'Dois sintomas da ficha base fecham a ocorrência com 100% de confiança.',
    meta: 'UEM · Fitossanidade',
  },
  {
    id: 'revisao',
    kind: 'Revisão',
    title: 'Abaixo de 60% segue para um técnico',
    description: 'Uma coincidência em duas fica encaminhada para revisão humana.',
    meta: 'Limiar de confiança',
  },
  {
    id: 'acesso',
    kind: 'Acesso',
    title: 'Só o técnico valida',
    description: 'O agricultor regista. A passagem a VALIDADA exige o perfil TECNICO.',
    meta: 'Controlo de perfil',
  },
] as const;

const MARCA = (
  <div className="acesso-logotipo">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="#f3efe4" />
      <path d="M24 36c-8-6-12-12-12-18a8 8 0 0 1 14-5 8 8 0 0 1 14 5c0 6-4 12-12 18z" fill="#1f6b45" />
      <path d="M24 34V16" stroke="#f3efe4" strokeWidth="2" />
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
        <FormularioLogin aoEntrar={aoEntrar} aoPrever={aoPrever} />
      </main>
      <aside className="acesso-marca" aria-label="Destaques e marca FitoSmart">
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
      <div className="acesso-movel">{MARCA}</div>
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
        <p className="nota">Contas de demonstração do plano de testes.</p>
        <div className="contas">
          {CONTAS_DEMO.map((conta) => (
            <button
              key={conta.email}
              type="button"
              className="chip"
              onMouseEnter={() => aoPrever(conta.perfil)}
              onFocus={() => aoPrever(conta.perfil)}
              onClick={() => {
                aoPrever(conta.perfil);
                setEmail(conta.email);
                setSenha(conta.senha);
                setErro('');
              }}
            >
              {conta.rotulo}
            </button>
          ))}
        </div>
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
      </form>
      <p className="acesso-rodape">© {ANO} UEM · Fitossanidade</p>
    </div>
  );
}

function Destaques() {
  const [indice, setIndice] = useState(0);
  const [direccao, setDireccao] = useState<1 | -1>(1);
  const [pausado, setPausado] = useState(false);
  const [reduzirMovimento, setReduzirMovimento] = useState(false);
  const total = DESTAQUES.length;

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sincronizar = () => setReduzirMovimento(consulta.matches);
    sincronizar();
    consulta.addEventListener('change', sincronizar);
    return () => consulta.removeEventListener('change', sincronizar);
  }, []);

  const ir = useCallback((sentido: -1 | 1) => {
    setDireccao(sentido);
    setIndice((atual) => (atual + sentido + total) % total);
  }, [total]);

  const irPara = useCallback(
    (destino: number) => {
      if (destino === indice) return;
      const frente = (destino - indice + total) % total;
      const tras = (indice - destino + total) % total;
      setDireccao(frente <= tras ? 1 : -1);
      setIndice(destino);
    },
    [indice, total],
  );

  useEffect(() => {
    if (pausado || reduzirMovimento || total <= 1) return;
    const relogio = window.setInterval(() => ir(1), INTERVALO_DESTAQUE_MS);
    return () => window.clearInterval(relogio);
  }, [pausado, reduzirMovimento, ir, total]);

  const destaque = DESTAQUES[indice];
  const classeEntrada = reduzirMovimento ? '' : direccao === 1 ? 'destaque-seguir' : 'destaque-voltar';

  return (
    <div
      className="destaques"
      role="region"
      aria-roledescription="carousel"
      aria-label="Destaques FitoSmart"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setPausado(false);
      }}
    >
      <div className="destaques-topo">
        <p>Destaques</p>
        <div>
          <button type="button" aria-label="Destaque anterior" onClick={() => ir(-1)}>
            ‹
          </button>
          <button type="button" aria-label="Destaque seguinte" onClick={() => ir(1)}>
            ›
          </button>
        </div>
      </div>
      <div className="destaque-cartao">
        <div
          key={`${destaque.id}-${direccao}`}
          className={`destaque-painel ${classeEntrada}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`${indice + 1} de ${total}: ${destaque.title}`}
        >
          <span className="destaque-tipo">{destaque.kind}</span>
          <p className="destaque-titulo">{destaque.title}</p>
          <p>{destaque.description}</p>
          <p className="destaque-meta">{destaque.meta}</p>
          <div className="destaque-progresso" aria-hidden="true">
            <span className={pausado || reduzirMovimento ? 'parado' : 'a-correr'} />
          </div>
        </div>
      </div>
      <div className="destaque-pontos" role="group" aria-label="Seleccionar destaque">
        {DESTAQUES.map((item, posicao) => (
          <button
            key={item.id}
            type="button"
            aria-current={posicao === indice ? 'true' : undefined}
            aria-label={`Ir para destaque ${posicao + 1}: ${item.title}`}
            onClick={() => irPara(posicao)}
          >
            <span className={posicao === indice ? 'activo' : ''} />
          </button>
        ))}
      </div>
    </div>
  );
}
