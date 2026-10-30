import {
  memo,
  startTransition,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { Sessao } from './sessao';

export type MenuId = 'painel' | 'nova' | 'ocorrencias' | 'fila' | 'acesso' | 'tempo';

type ItemMenu = { id: MenuId; rotulo: string; grupo: 'principal' | 'administracao' };

const MENUS_AGRICULTOR = [
  { id: 'painel', rotulo: 'Painel', grupo: 'principal' },
  { id: 'nova', rotulo: 'Nova ocorrência', grupo: 'principal' },
  { id: 'ocorrencias', rotulo: 'Ocorrências', grupo: 'principal' },
  { id: 'tempo', rotulo: 'Previsão do tempo', grupo: 'principal' },
] as const satisfies ReadonlyArray<ItemMenu>;

const MENUS_TECNICO = [
  { id: 'painel', rotulo: 'Painel', grupo: 'principal' },
  { id: 'fila', rotulo: 'Fila técnica', grupo: 'principal' },
  { id: 'tempo', rotulo: 'Previsão do tempo', grupo: 'principal' },
  { id: 'acesso', rotulo: 'Gestão de acesso', grupo: 'administracao' },
] as const satisfies ReadonlyArray<ItemMenu>;

const ICONES: Record<MenuId, ReactNode> = {
  painel: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  ),
  nova: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8.5v7M8.5 12h7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  ocorrencias: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 6.5h11M8 12h11M8 17.5h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="5" cy="6.5" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="17.5" r="1" fill="currentColor" />
    </svg>
  ),
  fila: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 7h14M5 12h14M5 17h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  ),
  acesso: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.5l7 3v5.8c0 4.2-2.9 7.2-7 8.7-4.1-1.5-7-4.5-7-8.7V6.5l7-3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  ),
  tempo: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M6.1 17.9l1.6-1.6M16.3 7.7l1.6-1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
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

const ICONE_RECOLHER = (
  <span className="barra-recolher-icone">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 6l-6 6 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

const CHAVE_BARRA = 'fitosmart-barra-recolhida';

function lerBarraRecolhida(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_BARRA) === '1';
  } catch {
    return false;
  }
}

const MenuConta = memo(function MenuConta({
  perfil,
  email,
  aoSair,
  compacto,
}: {
  perfil: Sessao['perfil'];
  email: string;
  aoSair: () => void;
  compacto: boolean;
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
        className={compacto ? 'conta-gatilho conta-gatilho-compacto' : 'conta-gatilho'}
        aria-label={`Menu da conta: ${rotulo}`}
        title={compacto ? `${rotulo} · ${email}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? tituloId : undefined}
        onClick={() => setAberto((atual) => !atual)}
      >
        <span className="conta-avatar" aria-hidden="true">
          {iniciais}
        </span>
        {compacto ? null : (
          <>
            <span className="conta-texto">
              <strong>{rotulo}</strong>
              <small translate="no">{email}</small>
            </span>
            {SETA_CONTA}
          </>
        )}
      </button>
      {aberto ? (
        <div
          ref={painel}
          id={tituloId}
          className="conta-painel"
          role="dialog"
          aria-modal="true"
          aria-label={`Conta de ${rotulo}`}
        >
          <div className="conta-cabeca">
            <span className="conta-avatar conta-avatar-grande" aria-hidden="true">
              {iniciais}
            </span>
            <span className="conta-texto">
              <strong>{rotulo}</strong>
              <small translate="no">{email}</small>
            </span>
          </div>
          <p className="conta-detalhe">Perfil {rotulo}. A sessão termina após 10&nbsp;minutos sem uso.</p>
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
  const [recolhida, setRecolhida] = useState(lerBarraRecolhida);
  const [ecraLargo, setEcraLargo] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 801px)').matches : true,
  );
  const compacta = recolhida && ecraLargo;

  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 801px)');
    const sincronizar = () => setEcraLargo(consulta.matches);
    sincronizar();
    consulta.addEventListener('change', sincronizar);
    return () => consulta.removeEventListener('change', sincronizar);
  }, []);

  function seguir(evento: MouseEvent<HTMLAnchorElement>, id: MenuId) {
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0) return;
    evento.preventDefault();
    startTransition(() => {
      aoEscolher(id);
    });
  }

  function alternarRecolha() {
    setRecolhida((atual) => {
      const proximo = !atual;
      try {
        window.localStorage.setItem(CHAVE_BARRA, proximo ? '1' : '0');
      } catch {
        // Sem armazenamento local — só o estado em memória.
      }
      return proximo;
    });
  }

  const principal: ItemMenu[] = [];
  const administracao: ItemMenu[] = [];
  for (const item of menusDoPerfil(perfil)) {
    if (item.grupo === 'administracao') administracao.push(item);
    else principal.push(item);
  }

  function ligacao(item: ItemMenu) {
    const activo = menu === item.id;
    return (
      <a
        key={item.id}
        className={activo ? 'menu-item menu-item-activo' : 'menu-item'}
        href={urlDoMenu(item.id)}
        aria-current={activo ? 'page' : undefined}
        aria-label={compacta ? item.rotulo : undefined}
        title={compacta ? item.rotulo : undefined}
        onClick={(evento) => seguir(evento, item.id)}
        onPointerEnter={item.id === 'acesso' ? aoPreverAcesso : undefined}
        onFocus={item.id === 'acesso' ? aoPreverAcesso : undefined}
      >
        <span className="menu-item-icone" aria-hidden="true">
          {ICONES[item.id]}
        </span>
        <span className="menu-item-rotulo">{item.rotulo}</span>
      </a>
    );
  }

  return (
    <aside
      className={compacta ? 'barra barra-recolhida' : 'barra'}
      aria-label="Navegação da aplicação"
      data-recolhida={compacta ? 'true' : 'false'}
    >
      <header className="barra-topo">
        <div className="barra-marca">{marca}</div>
        <button
          type="button"
          className="barra-recolher"
          aria-expanded={!compacta}
          aria-controls="barra-navegacao"
          aria-label={compacta ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          title={compacta ? 'Expandir' : 'Recolher'}
          onClick={alternarRecolha}
        >
          {ICONE_RECOLHER}
        </button>
      </header>
      <nav id="barra-navegacao" className="barra-nav" aria-label="Menu principal">
        {compacta ? null : (
          <h2 className="grupo-rotulo">Menu</h2>
        )}
        {principal.map((item) => ligacao(item))}
        {administracao.length > 0 ? (
          <div className="grupo-admin">
            {compacta ? null : <h2 className="grupo-rotulo">Administração</h2>}
            {administracao.map((item) => ligacao(item))}
          </div>
        ) : null}
      </nav>
      <footer className="barra-utilizador">
        <MenuConta perfil={perfil} email={email} aoSair={aoSair} compacto={compacta} />
      </footer>
    </aside>
  );
});
