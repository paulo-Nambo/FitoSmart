import { useState, type FormEvent } from 'react';
import { entrar } from './api';
import { guardarSessao, type Sessao } from './sessao';

const CONTAS_DEMO = [
  { email: 'agricultor@uem.mz', senha: '123456', rotulo: 'Agricultor' },
  { email: 'tecnico@uem.mz', senha: '123456', rotulo: 'Técnico' },
] as const;

interface EcraLoginProps {
  aoEntrar: (sessao: Sessao) => void;
}

export function EcraLogin({ aoEntrar }: EcraLoginProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (!email.includes('@')) {
      setErro('O email precisa de incluir @.');
      return;
    }
    if (senha.length < 6) {
      setErro('A senha precisa de pelo menos 6 caracteres.');
      return;
    }
    setAEnviar(true);
    try {
      const sessao = await entrar(email, senha);
      guardarSessao(sessao);
      aoEntrar(sessao);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha no login');
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <form className="cartao" onSubmit={submeter}>
      <h2>Entrar</h2>
      <p className="nota">Use uma conta de demonstração do plano de testes.</p>
      <div className="contas">
        {CONTAS_DEMO.map((conta) => (
          <button
            key={conta.email}
            type="button"
            className="chip"
            onClick={() => {
              setEmail(conta.email);
              setSenha(conta.senha);
              setErro(null);
            }}
          >
            {conta.rotulo}
          </button>
        ))}
      </div>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(evento) => setEmail(evento.target.value)}
        required
      />
      <label htmlFor="senha">Senha</label>
      <input
        id="senha"
        name="senha"
        type="password"
        autoComplete="current-password"
        minLength={6}
        value={senha}
        onChange={(evento) => setSenha(evento.target.value)}
        required
      />
      {erro ? <p className="alerta">{erro}</p> : null}
      <button type="submit" className="primario" disabled={aEnviar}>
        {aEnviar ? 'A entrar…' : 'Entrar'}
      </button>
    </form>
  );
}
