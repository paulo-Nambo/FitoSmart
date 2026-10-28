import { memo, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { Sessao } from './sessao';

export type MenuId = 'painel' | 'nova' | 'ocorrencias' | 'fila' | 'acesso';

const MENUS_AGRICULTOR = [
  { id: 'painel', rotulo: 'Painel', grupo: 'principal' },
  { id: 'nova', rotulo: 'Nova ocorrência', grupo: 'principal' },
  { id: 'ocorrencias', rotulo: 'Ocorrências', grupo: 'principal' },
] as const satisfies ReadonlyArray<{ id: MenuId; rotulo: string; grupo: 'principal' | 'administracao' }>;

const MENUS_TECNICO = [
  { id: 'painel', rotulo: 'Painel', grupo: 'principal' },
  { id: 'fila', rotulo: 'Fila técnica', grupo: 'principal' },
  { id: 'acesso', rotulo: 'Gestão de Acesso', grupo: 'administracao' },
] as const satisfies ReadonlyArray<{ id: MenuId; rotulo: string; grupo: 'principal' | 'administracao' }>;

const ICONES: Record<MenuId, ReactNode> = {
  painel: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  nova: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  ocorrencias: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h12M6 12h12M6 17h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  fila: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  acesso: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
};

const ROTULO_PERFIL: Record<Sessao['perfil'], string> = {
  AGRICULTOR: 'Agricultor',
  TECNICO: 'Técnico',
};

const INICIAIS_PERFIL: Record<Sessao['perfil'], string> = {
  AGRICULTOR: 'AG',
  TECNICO: 'TE',
};

const SETA_CONTA = (
  <svg className="conta-seta" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MenuConta = memo(function MenuConta({
  perfil,
  email,
  aoSair,
}: {
  perfil: Sessao['perfil'];
  email: string;
  aoSair: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const rotulo = ROTULO_PERFIL[perfil];
  const iniciais = INICIAIS_PERFIL[perfil];

  useEffect(() => {
    if (!aberto) return;
    const fecharTecla = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      setAberto(false);
      gatilho.current?.focus();
    };
    const fecharFora = (evento: PointerEvent) => {
      const alvo = evento.target;
      if (!(alvo instanceof Node) || raiz.current?.contains(alvo)) return;
      setAberto(false);
    };
    document.addEventListener('keydown', fecharTecla);
    document.addEventListener('pointerdown', fecharFora);
    painel.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('keydown', fecharTecla);
      document.removeEventListener('pointerdown', fecharFora);
    };
  }, [aberto]);

  return (
    <div className="conta" ref={raiz}>
      <button
        ref={gatilho}
        type="button"
        className="conta-gatilho"
        aria-label={`Menu da conta: ${rotulo}`}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? tituloId : undefined}
        onClick={() => setAberto((atual) => !atual)}
      >
        <span className="conta-avatar" aria-hidden="true">
          {iniciais}
        </span>
        <span className="conta-texto">
          <strong>{rotulo}</strong>
          <small translate="no">{email}</small>
        </span>
        {SETA_CONTA}
      </button>
      {aberto ? (
        <div ref={painel} id={tituloId} className="conta-painel" role="dialog" aria-label={`Conta de ${rotulo}`}>
          <div className="conta-cabeca">
            <span className="conta-avatar conta-avatar-grande" aria-hidden="true">
              {iniciais}
            </span>
            <span className="conta-texto">
              <strong>{rotulo}</strong>
              <small translate="no">{email}</small>
            </span>
          </div>
          <p className="conta-detalhe">Perfil {rotulo}. A sessão termina após 10 minutos sem uso.</p>
          <button type="button" className="conta-sair" onClick={aoSair}>
            Terminar sessão
          </button>
        </div>
      ) : null}
    </div>
  );
});

function menusDoPerfil(perfil: Sessao['perfil']) {
  return perfil === 'AGRICULTOR' ? MENUS_AGRICULTOR : MENUS_TECNICO;
}

export function lerMenu(perfil: Sessao['perfil']): MenuId {
  const valor = new URLSearchParams(window.location.search).get('menu');
  if (menusDoPerfil(perfil).some((item) => item.id === valor)) return valor as MenuId;
  return 'painel';
}

export function urlDoMenu(id: MenuId): string {
  const params = new URLSearchParams(window.location.search);
  params.delete('idle');
  if (id === 'painel') params.delete('menu');
  else params.set('menu', id);
  const consulta = params.toString();
  return consulta ? `${window.location.pathname}?${consulta}` : window.location.pathname;
}

interface BarraLateralProps {
  marca: ReactNode;
  perfil: Sessao['perfil'];
  email: string;
  menu: MenuId;
  aoEscolher: (menu: MenuId) => void;
  aoPreverAcesso: () => void;
  aoSair: () => void;
}

export const BarraLateral = memo(function BarraLateral({
  marca,
  perfil,
  email,
  menu,
  aoEscolher,
  aoPreverAcesso,
  aoSair,
}: BarraLateralProps) {
  function seguir(evento: MouseEvent<HTMLAnchorElement>, id: MenuId) {
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0) return;
    evento.preventDefault();
    aoEscolher(id);
  }

  const principal = [];
  const administracao = [];
  for (const item of menusDoPerfil(perfil)) {
    if (item.grupo === 'administracao') administracao.push(item);
    else principal.push(item);
  }

  function ligacao(item: (typeof MENUS_TECNICO)[number] | (typeof MENUS_AGRICULTOR)[number]) {
    return (
      <a
        key={item.id}
        className="menu-item"
        href={urlDoMenu(item.id)}
        aria-current={menu === item.id ? 'page' : undefined}
        onClick={(evento) => seguir(evento, item.id)}
        onPointerEnter={item.id === 'acesso' ? aoPreverAcesso : undefined}
        onFocus={item.id === 'acesso' ? aoPreverAcesso : undefined}
      >
        {ICONES[item.id]}
        {item.rotulo}
      </a>
    );
  }

  return (
    <aside className="barra">
      <div className="barra-marca">{marca}</div>
      <nav className="barra-nav" aria-label="Menu principal">
        {principal.map((item) => ligacao(item))}
        {administracao.length > 0 ? (
          <div className="grupo-admin">
            <p className="grupo-rotulo">Administração</p>
            {administracao.map((item) => ligacao(item))}
          </div>
        ) : null}
      </nav>
      <div className="barra-utilizador">
        <MenuConta perfil={perfil} email={email} aoSair={aoSair} />
      </div>
    </aside>
  );
});
