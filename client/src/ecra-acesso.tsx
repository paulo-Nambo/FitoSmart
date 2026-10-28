import { memo, useCallback, useEffect, useState, type FormEvent } from 'react';
import { actualizarPerfil, criarUtilizador, listarUtilizadores, type Conta } from './api';

const PERFIS = [
  { id: 'AGRICULTOR', rotulo: 'Agricultor' },
  { id: 'TECNICO', rotulo: 'Técnico' },
] as const;

const NOTA = (
  <p className="nota">Só o perfil Técnico cria contas e muda o perfil de outra pessoa. A sua sessão não muda aqui.</p>
);

function opcoesPerfil() {
  return PERFIS.map((item) => (
    <option key={item.id} value={item.id}>
      {item.rotulo}
    </option>
  ));
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
    <li className="conta-linha">
      <div>
        <strong translate="no">{conta.email}</strong>
        {propria ? <p className="nota">Esta é a sua sessão.</p> : null}
      </div>
      <label className="conta-perfil" htmlFor={`perfil-${conta.email}`}>
        Perfil
        <select
          id={`perfil-${conta.email}`}
          name="perfil"
          autoComplete="off"
          value={escolha}
          disabled={propria || aGuardar}
          onChange={(evento) => setEscolha(evento.target.value as Conta['perfil'])}
        >
          {opcoesPerfil()}
        </select>
      </label>
      {propria ? null : (
        <button type="button" className="secundario" disabled={!alterado || aGuardar} aria-busy={aGuardar} onClick={guardar}>
          {aGuardar ? 'A guardar…' : 'Guardar perfil'}
        </button>
      )}
      {erro ? (
        <p className="alerta" role="alert">
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
  return (
    <section className="cartao lista">
      <h2 className="titulo">Contas</h2>
      {contas.length === 0 ? (
        <p className="nota">Ainda não há contas.</p>
      ) : (
        <ul className="contas-lista">
          {contas.map((conta) => (
            <LinhaConta key={conta.email} conta={conta} propria={conta.email === emailSessao} aoGuardar={aoGuardar} />
          ))}
        </ul>
      )}
    </section>
  );
});

function FormularioConta({ aoCriar, token }: { token: string; aoCriar: (conta: Conta) => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<Conta['perfil']>('AGRICULTOR');
  const [erro, setErro] = useState<string | null>(null);
  const [aCriar, setACriar] = useState(false);

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    const endereco = email.trim().toLowerCase();
    if (!endereco.includes('@') || !endereco.split('@')[1]?.includes('.')) {
      setErro('Indique um email válido, por exemplo nome@uem.mz.');
      return;
    }
    if (senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setACriar(true);
    try {
      const resposta = await criarUtilizador(token, { email: endereco, senha, perfil });
      aoCriar(resposta.utilizador);
      setEmail('');
      setSenha('');
      setPerfil('AGRICULTOR');
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível criar a conta. Tente novamente.');
    } finally {
      setACriar(false);
    }
  }

  return (
    <form className="cartao" onSubmit={submeter}>
      <h2 className="titulo">Nova conta</h2>
      <label htmlFor="conta-email">Email</label>
      <input
        id="conta-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        placeholder="nome@uem.mz…"
        value={email}
        onChange={(evento) => setEmail(evento.target.value)}
      />
      <label htmlFor="conta-senha">Senha</label>
      <input
        id="conta-senha"
        name="new-password"
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        value={senha}
        onChange={(evento) => setSenha(evento.target.value)}
      />
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
      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : null}
      <button type="submit" className="primario enviar" disabled={aCriar} aria-busy={aCriar}>
        {aCriar ? 'A criar…' : 'Criar conta'}
      </button>
    </form>
  );
}

export function EcraAcesso({ token, emailSessao }: { token: string; emailSessao: string }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    listarUtilizadores(token)
      .then((dados) => {
        if (ativo) setContas(dados.utilizadores);
      })
      .catch((falha: unknown) => {
        if (!ativo) return;
        setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar as contas.');
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
      seguinte.sort((a, b) => a.email.localeCompare(b.email));
      return seguinte;
    });
  }, []);

  return (
    <>
      <h1 className="titulo">Gestão de Acesso</h1>
      {NOTA}
      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : (
        <div className="grelha">
          <FormularioConta token={token} aoCriar={criar} />
          <ListaContas contas={contas} emailSessao={emailSessao} aoGuardar={guardar} />
        </div>
      )}
    </>
  );
}

