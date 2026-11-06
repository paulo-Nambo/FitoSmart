import { memo, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { actualizarPerfil, criarUtilizador, listarUtilizadores, type Conta } from './api';
import { PERFIS, ROTULO_PERFIL, type Perfil } from './perfis';
import { RegrasSenha } from './regras-senha';
import { mensagemSenhaNovaInvalida, senhaNovaValida, SENHA_MIN_NOVA } from './senha';

function opcoesPerfil() {
  return PERFIS.map((id) => (
    <option key={id} value={id}>
      {ROTULO_PERFIL[id]}
    </option>
  ));
}

function rotuloPerfil(perfil: Conta['perfil']): string {
  return ROTULO_PERFIL[perfil] ?? perfil;
}

function iniciais(nome: string, email: string): string {
  const texto = nome.trim() || email.split('@')[0] || '?';
  const partes = texto.split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return `${partes[0]![0] ?? ''}${partes[1]![0] ?? ''}`.toUpperCase();
  return texto.slice(0, 2).toUpperCase();
}

const LinhaConta = memo(function LinhaConta({
  conta,
  propria,
  aoGuardar,
}: {
  conta: Conta;
  propria: boolean;
  aoGuardar: (email: string, perfil: Conta['perfil']) => Promise<void>;
}) {
  const [escolha, setEscolha] = useState(conta.perfil);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const alterado = escolha !== conta.perfil;

  useEffect(() => {
    setEscolha(conta.perfil);
  }, [conta.perfil]);

  function guardar() {
    setAGuardar(true);
    setErro(null);
    aoGuardar(conta.email, escolha)
      .catch((falha: unknown) => {
        setErro(falha instanceof Error ? falha.message : 'Não foi possível guardar o perfil. Tente novamente.');
      })
      .finally(() => setAGuardar(false));
  }

  return (
    <li className={propria ? 'gestao-linha gestao-linha-propria' : 'gestao-linha'}>
      <span className="gestao-avatar" aria-hidden="true">
        {iniciais(conta.nome, conta.email)}
      </span>
      <div className="gestao-identidade">
        <strong className="quebrar">{conta.nome || 'Sem nome'}</strong>
        <p className="nota gestao-meta">
          <span translate="no">{conta.email}</span>
          {conta.organizacao ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>{conta.organizacao}</span>
            </>
          ) : null}
        </p>
        {propria ? <p className="nota">A sua sessão</p> : null}
      </div>
      <span className={`gestao-selo gestao-selo-${conta.perfil.toLowerCase()}`}>{rotuloPerfil(conta.perfil)}</span>
      {propria ? (
        <p className="nota gestao-bloqueio">Perfil da sessão activa — não se altera aqui.</p>
      ) : (
        <div className="gestao-accao">
          <label className="sr-only" htmlFor={`perfil-${conta.email}`}>
            Perfil de {conta.nome}
          </label>
          <select
            id={`perfil-${conta.email}`}
            name="perfil"
            autoComplete="off"
            value={escolha}
            disabled={aGuardar}
            onChange={(evento) => setEscolha(evento.target.value as Conta['perfil'])}
          >
            {opcoesPerfil()}
          </select>
          <button
            type="button"
            className="secundario"
            disabled={!alterado || aGuardar}
            aria-busy={aGuardar}
            onClick={guardar}
          >
            {aGuardar ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      )}
      {erro ? (
        <p className="alerta gestao-erro" role="alert">
          {erro}
        </p>
      ) : null}
    </li>
  );
});

const ListaContas = memo(function ListaContas({
  contas,
  emailSessao,
  aoGuardar,
}: {
  contas: Conta[];
  emailSessao: string;
  aoGuardar: (email: string, perfil: Conta['perfil']) => Promise<void>;
}) {
  const total = contas.length;
  const resumoPerfis = useMemo(() => {
    const contagem = Object.fromEntries(PERFIS.map((id) => [id, 0])) as Record<Perfil, number>;
    for (const conta of contas) contagem[conta.perfil] += 1;
    return PERFIS.filter((id) => contagem[id] > 0)
      .map((id) => `${contagem[id]} ${ROTULO_PERFIL[id].toLowerCase()}${contagem[id] === 1 ? '' : 's'}`)
      .slice(0, 3)
      .join(' · ');
  }, [contas]);

  return (
    <section className="cartao gestao-lista" aria-labelledby="gestao-contas-titulo">
      <header className="lista-cabeca">
        <div>
          <h2 id="gestao-contas-titulo" className="titulo">
            Contas
          </h2>
          <p className="nota lista-total">
            {total === 0 ? 'Ainda não há contas' : `${total} conta${total === 1 ? '' : 's'}${resumoPerfis ? ` · ${resumoPerfis}` : ''}`}
          </p>
        </div>
      </header>
      {contas.length === 0 ? (
        <p className="lista-vazia">Crie a primeira conta no formulário ao lado.</p>
      ) : (
        <ul className="gestao-contas">
          {contas.map((conta) => (
            <LinhaConta key={conta.email} conta={conta} propria={conta.email === emailSessao} aoGuardar={aoGuardar} />
          ))}
        </ul>
      )}
    </section>
  );
});

function FormularioConta({ aoCriar, token }: { token: string; aoCriar: (conta: Conta) => void }) {
  const [nome, setNome] = useState('');
  const [organizacao, setOrganizacao] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<Conta['perfil']>('AGRICULTOR');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [aCriar, setACriar] = useState(false);

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);
    const titular = nome.trim().replace(/\s+/g, ' ');
    const endereco = email.trim().toLowerCase();
    if (titular.length < 2) {
      setErro('Indique o nome da pessoa a quem a conta pertence.');
      return;
    }
    if (!endereco.includes('@') || !endereco.split('@')[1]?.includes('.')) {
      setErro('Indique um email válido, por exemplo nome@uem.mz.');
      return;
    }
    if (!senhaNovaValida(senha)) {
      setErro(mensagemSenhaNovaInvalida(senha));
      return;
    }
    setACriar(true);
    try {
      const resposta = await criarUtilizador(token, {
        email: endereco,
        senha,
        perfil,
        nome: titular,
        organizacao: organizacao.trim() || null,
      });
      aoCriar(resposta.utilizador);
      setNome('');
      setOrganizacao('');
      setEmail('');
      setSenha('');
      setPerfil('AGRICULTOR');
      setSucesso(`Conta de ${resposta.utilizador.nome} criada.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível criar a conta. Tente novamente.');
    } finally {
      setACriar(false);
    }
  }

  return (
    <form className="cartao gestao-formulario" onSubmit={submeter} autoComplete="off">
      <header className="form-cabeca">
        <h2 className="titulo">Nova conta</h2>
        <p className="nota">Quem é o titular, como entra no sistema e com que perfil.</p>
      </header>

      <fieldset className="gestao-bloco">
        <legend>Titular</legend>
        <div className="gestao-campos gestao-campos-2">
          <div className="form-campo">
            <label htmlFor="conta-nome">Nome</label>
            <input
              id="conta-nome"
              name="nome"
              type="text"
              autoComplete="name"
              maxLength={80}
              placeholder="Carlos Mandlate"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              required
            />
          </div>
          <div className="form-campo">
            <label htmlFor="conta-organizacao">
              Organização <span className="form-opcional">opcional</span>
            </label>
            <input
              id="conta-organizacao"
              name="organizacao"
              type="text"
              autoComplete="organization"
              maxLength={80}
              placeholder="Cooperativa de Maputo"
              value={organizacao}
              onChange={(evento) => setOrganizacao(evento.target.value)}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="gestao-bloco">
        <legend>Credenciais</legend>
        <div className="gestao-campos gestao-campos-3">
          <div className="form-campo">
            <label htmlFor="conta-email">Email</label>
            <input
              id="conta-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="nome@uem.mz"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              required
            />
          </div>
          <div className="form-campo gestao-campo-senha">
            <label htmlFor="conta-senha">Senha inicial</label>
            <input
              id="conta-senha"
              name="new-password"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              minLength={SENHA_MIN_NOVA}
              placeholder="Ex.: FitoSmart1!"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              required
              aria-describedby="conta-senha-regras"
            />
            <RegrasSenha id="conta-senha-regras" senha={senha} />
          </div>
          <div className="form-campo">
            <label htmlFor="conta-perfil">Perfil</label>
            <select
              id="conta-perfil"
              name="perfil"
              autoComplete="off"
              value={perfil}
              onChange={(evento) => setPerfil(evento.target.value as Conta['perfil'])}
            >
              {opcoesPerfil()}
            </select>
          </div>
        </div>
      </fieldset>

      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : null}
      {sucesso ? (
        <p className="sucesso" role="status" aria-live="polite">
          {sucesso}
        </p>
      ) : null}
      <div className="gestao-form-rodape">
        <button type="submit" className="primario enviar" disabled={aCriar} aria-busy={aCriar}>
          {aCriar ? 'A criar…' : 'Criar conta'}
        </button>
      </div>
    </form>
  );
}

type SeparadorAcesso = 'nova' | 'contas';

export function EcraAcesso({ token, emailSessao }: { token: string; emailSessao: string }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [separador, setSeparador] = useState<SeparadorAcesso>('nova');

  useEffect(() => {
    let ativo = true;
    setACarregar(true);
    listarUtilizadores(token)
      .then((dados) => {
        if (!ativo) return;
        setContas(dados.utilizadores);
        setErro(null);
      })
      .catch((falha: unknown) => {
        if (!ativo) return;
        setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar as contas.');
      })
      .finally(() => {
        if (ativo) setACarregar(false);
      });
    return () => {
      ativo = false;
    };
  }, [token]);

  const guardar = useCallback(
    (email: string, perfil: Conta['perfil']) =>
      actualizarPerfil(token, email, perfil).then((resposta) => {
        setContas((atual) => atual.map((item) => (item.email === email ? resposta.utilizador : item)));
      }),
    [token],
  );

  const criar = useCallback((conta: Conta) => {
    setContas((atual) => {
      if (atual.some((item) => item.email === conta.email)) return atual;
      const seguinte = [...atual, conta];
      seguinte.sort((a, b) => a.nome.localeCompare(b.nome, 'pt') || a.email.localeCompare(b.email));
      return seguinte;
    });
    setSeparador('contas');
  }, []);

  return (
    <section className="gestao-acesso" aria-busy={aCarregar}>
      <header className="lista-cabeca">
        <div>
          <h1 className="titulo">Gestão de acesso</h1>
          <p className="nota">
            Cada conta tem um titular e, se fizer sentido, a organização. Só administradores de contas ou do sistema criam contas e mudam perfis.
          </p>
        </div>
      </header>

      <div className="gestao-tabs" role="tablist" aria-label="Secções de gestão de acesso">
        <button
          type="button"
          role="tab"
          id="tab-nova-conta"
          className={separador === 'nova' ? 'gestao-tab activa' : 'gestao-tab'}
          aria-selected={separador === 'nova'}
          aria-controls="painel-nova-conta"
          tabIndex={separador === 'nova' ? 0 : -1}
          onClick={() => setSeparador('nova')}
        >
          Nova conta
        </button>
        <button
          type="button"
          role="tab"
          id="tab-lista-contas"
          className={separador === 'contas' ? 'gestao-tab activa' : 'gestao-tab'}
          aria-selected={separador === 'contas'}
          aria-controls="painel-lista-contas"
          tabIndex={separador === 'contas' ? 0 : -1}
          onClick={() => setSeparador('contas')}
        >
          Contas
          <span className="gestao-tab-conta numero">{contas.length}</span>
        </button>
      </div>

      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : null}

      {aCarregar && contas.length === 0 && !erro ? <p className="nota">A carregar contas…</p> : null}

      {!erro && separador === 'nova' ? (
        <div
          id="painel-nova-conta"
          role="tabpanel"
          aria-labelledby="tab-nova-conta"
          className="gestao-painel"
        >
          <FormularioConta token={token} aoCriar={criar} />
        </div>
      ) : null}

      {!erro && separador === 'contas' ? (
        <div
          id="painel-lista-contas"
          role="tabpanel"
          aria-labelledby="tab-lista-contas"
          className="gestao-painel"
        >
          <ListaContas contas={contas} emailSessao={emailSessao} aoGuardar={guardar} />
        </div>
      ) : null}
    </section>
  );
}
