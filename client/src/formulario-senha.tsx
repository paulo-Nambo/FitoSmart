import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { alterarSenha } from './api';
import { RegrasSenha } from './regras-senha';
import { mensagemSenhaNovaInvalida, senhaNovaValida, senhaValida, SENHA_MIN_NOVA } from './senha';

const ICONE_FECHAR = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M7 7l10 10M17 7 7 17" />
  </svg>
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
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      d="M6.2 6.8C4 8.3 2.4 10.4 2 12c1.2 4 5.2 7 10 7 1.6 0 3.1-.3 4.4-.9M10 5.1A10 10 0 0 1 12 5c4.8 0 8.8 3 10 7-.4.9-1 1.8-1.7 2.6"
    />
  </svg>
);

function CampoSenha({
  id,
  rotulo,
  valor,
  aoMudar,
  autoComplete,
  mostrar,
  aoAlternar,
  placeholder,
  comIcone = true,
  minLength = 6,
  descritoPor,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  autoComplete: string;
  mostrar: boolean;
  aoAlternar: () => void;
  placeholder: string;
  comIcone?: boolean;
  minLength?: number;
  descritoPor?: string;
}) {
  return (
    <>
      <label htmlFor={id}>{rotulo}</label>
      <div className={comIcone ? 'acesso-campo' : 'conta-ficha-campo'}>
        {comIcone ? ICONE_CADEADO : null}
        <input
          id={id}
          name={id}
          type={mostrar ? 'text' : 'password'}
          autoComplete={autoComplete}
          spellCheck={false}
          placeholder={placeholder}
          minLength={minLength}
          value={valor}
          onChange={(evento) => aoMudar(evento.target.value)}
          required
          aria-describedby={descritoPor}
        />
        <button
          type="button"
          className="olho"
          aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={mostrar}
          onClick={aoAlternar}
        >
          {mostrar ? ICONE_OCULTAR : ICONE_VER}
        </button>
      </div>
    </>
  );
}

export interface FormularioAlterarSenhaProps {
  emailInicial?: string;
  emailFixo?: boolean;
  token?: string;
  titulo?: string;
  tituloId?: string;
  variante?: 'acesso' | 'ficha';
  rotuloCancelar?: string;
  rodape?: ReactNode;
  aoSucesso?: (mensagem: string) => void;
  aoCancelar?: () => void;
}

export function FormularioAlterarSenha({
  emailInicial = '',
  emailFixo = false,
  token,
  titulo = 'Alterar senha',
  tituloId,
  variante = 'acesso',
  rotuloCancelar = 'Voltar ao acesso',
  rodape,
  aoSucesso,
  aoCancelar,
}: FormularioAlterarSenhaProps) {
  const [email, setEmail] = useState(emailInicial);
  const [senhaActual, setSenhaActual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarActual, setMostrarActual] = useState(false);
  const [mostrarNova, setMostrarNova] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const alertaRef = useRef<HTMLDivElement>(null);
  const focarAlerta = useRef(false);
  const ficha = variante === 'ficha';

  useEffect(() => {
    setEmail(emailInicial);
  }, [emailInicial]);

  useEffect(() => {
    if ((!erro && !sucesso) || !focarAlerta.current) return;
    focarAlerta.current = false;
    alertaRef.current?.focus();
  }, [erro, sucesso]);

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setSucesso('');
    const emailLimpo = email.trim().toLowerCase();
    if (!emailLimpo.includes('@')) {
      focarAlerta.current = true;
      setErro('O email precisa de incluir @.');
      return;
    }
    if (!senhaValida(senhaActual)) {
      focarAlerta.current = true;
      setErro('A senha actual precisa de pelo menos 6 caracteres.');
      return;
    }
    if (!senhaNovaValida(senhaNova)) {
      focarAlerta.current = true;
      setErro(mensagemSenhaNovaInvalida(senhaNova));
      return;
    }
    if (senhaNova === senhaActual) {
      focarAlerta.current = true;
      setErro('A nova senha tem de ser diferente da senha actual.');
      return;
    }
    if (senhaNova !== confirmacao) {
      focarAlerta.current = true;
      setErro('A confirmação não coincide com a nova senha.');
      return;
    }

    setAEnviar(true);
    try {
      const resposta = await alterarSenha({ email: emailLimpo, senhaActual, senhaNova }, token);
      setSenhaActual('');
      setSenhaNova('');
      setConfirmacao('');
      focarAlerta.current = true;
      setSucesso(resposta.mensagem);
      aoSucesso?.(resposta.mensagem);
    } catch (falha) {
      focarAlerta.current = true;
      setErro(falha instanceof Error ? falha.message : 'Não foi possível alterar a senha.');
    } finally {
      setAEnviar(false);
    }
  }

  const podeGuardar = senhaValida(senhaActual) && senhaNovaValida(senhaNova) && senhaNova === confirmacao && senhaNova !== senhaActual;

  const campos = (
    <>
      <CampoSenha
        id="senha-actual"
        rotulo="Senha actual"
        valor={senhaActual}
        aoMudar={setSenhaActual}
        autoComplete="current-password"
        mostrar={mostrarActual}
        aoAlternar={() => setMostrarActual((v) => !v)}
        placeholder="Senha actual…"
        comIcone={!ficha}
      />
      <CampoSenha
        id="senha-nova"
        rotulo="Nova senha"
        valor={senhaNova}
        aoMudar={setSenhaNova}
        autoComplete="new-password"
        mostrar={mostrarNova}
        aoAlternar={() => setMostrarNova((v) => !v)}
        placeholder={`Ex.: FitoSmart1!`}
        comIcone={!ficha}
        minLength={SENHA_MIN_NOVA}
        descritoPor="senha-regras"
      />
      <RegrasSenha id="senha-regras" senha={senhaNova} />
      <CampoSenha
        id="senha-confirmacao"
        rotulo="Confirmar nova senha"
        valor={confirmacao}
        aoMudar={setConfirmacao}
        autoComplete="new-password"
        mostrar={mostrarNova}
        aoAlternar={() => setMostrarNova((v) => !v)}
        placeholder="Repita a nova senha…"
        comIcone={!ficha}
        minLength={SENHA_MIN_NOVA}
      />
      {erro ? (
        <div id="senha-erro" ref={alertaRef} tabIndex={-1} className="acesso-alerta" role="alert">
          <p>{erro}</p>
        </div>
      ) : null}
      {sucesso ? (
        <div id="senha-ok" ref={alertaRef} tabIndex={-1} className="acesso-sucesso" role="status">
          <p>{sucesso}</p>
        </div>
      ) : null}
    </>
  );

  if (ficha) {
    return (
      <div className="conta-ficha">
        <header className="conta-ficha-topo">
          <div>
            <h2 id={tituloId}>{titulo}</h2>
            <p>Letra, número e símbolo · mínimo 8 caracteres.</p>
          </div>
          {aoCancelar ? (
            <button type="button" className="conta-ficha-fechar" aria-label="Fechar" onClick={aoCancelar}>
              {ICONE_FECHAR}
            </button>
          ) : null}
        </header>

        {emailFixo ? (
          <dl className="conta-ficha-resumo">
            <div>
              <dt>Email</dt>
              <dd translate="no">{email}</dd>
            </div>
          </dl>
        ) : null}

        <form
          className="conta-ficha-form"
          onSubmit={submeter}
          aria-describedby={erro ? 'senha-erro' : sucesso ? 'senha-ok' : undefined}
        >
          {!emailFixo ? (
            <>
              <label htmlFor="senha-email">Email</label>
              <input
                id="senha-email"
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
            </>
          ) : null}
          {campos}
          <div className="conta-ficha-acoes">
            {aoCancelar ? (
              <button type="button" className="secundario" onClick={aoCancelar}>
                Cancelar
              </button>
            ) : null}
            <button type="submit" className="primario" disabled={aEnviar || !podeGuardar} aria-busy={aEnviar}>
              {aEnviar ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="acesso-caixa">
      <h1>{titulo}</h1>
      <p className="nota acesso-ajuda">Confirme a senha actual e defina uma nova com letra, número e símbolo.</p>
      <form onSubmit={submeter} aria-describedby={erro ? 'senha-erro' : sucesso ? 'senha-ok' : undefined}>
        <label htmlFor="senha-email">Email</label>
        <div className="acesso-campo">
          {ICONE_EMAIL}
          <input
            id="senha-email"
            name="username"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nome@uem.mz"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            required
            readOnly={emailFixo}
            aria-readonly={emailFixo || undefined}
          />
        </div>
        {campos}
        <button type="submit" className="primario entrar" disabled={aEnviar || !podeGuardar} aria-busy={aEnviar}>
          {aEnviar ? 'A guardar…' : 'Guardar nova senha'}
          {aEnviar ? null : <span aria-hidden="true">→</span>}
        </button>
        {aoCancelar ? (
          <button type="button" className="acesso-ligacao" onClick={aoCancelar}>
            {rotuloCancelar}
          </button>
        ) : null}
      </form>
      {rodape}
    </div>
  );
}
