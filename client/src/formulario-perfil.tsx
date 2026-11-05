import { useEffect, useRef, useState, type FormEvent } from 'react';
import { actualizarConta } from './api';
import { ROTULO_PERFIL, type Perfil } from './perfis';

const ICONE_FECHAR = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M7 7l10 10M17 7 7 17" />
  </svg>
);

export interface FormularioPerfilProps {
  token: string;
  email: string;
  perfil: Perfil;
  nomeInicial?: string;
  organizacaoInicial?: string | null;
  tituloId: string;
  aoSucesso: (dados: { nome: string; organizacao: string | null; mensagem: string }) => void;
  aoCancelar: () => void;
}

export function FormularioPerfil({
  token,
  email,
  perfil,
  nomeInicial = '',
  organizacaoInicial = null,
  tituloId,
  aoSucesso,
  aoCancelar,
}: FormularioPerfilProps) {
  const [nome, setNome] = useState(nomeInicial);
  const [organizacao, setOrganizacao] = useState(organizacaoInicial ?? '');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const alertaRef = useRef<HTMLDivElement>(null);
  const focarAlerta = useRef(false);
  const alterado =
    nome.trim().replace(/\s+/g, ' ') !== (nomeInicial ?? '').trim().replace(/\s+/g, ' ') ||
    (organizacao.trim().replace(/\s+/g, ' ') || '') !== ((organizacaoInicial ?? '').trim().replace(/\s+/g, ' ') || '');

  useEffect(() => {
    setNome(nomeInicial);
    setOrganizacao(organizacaoInicial ?? '');
  }, [nomeInicial, organizacaoInicial]);

  useEffect(() => {
    if ((!erro && !sucesso) || !focarAlerta.current) return;
    focarAlerta.current = false;
    alertaRef.current?.focus();
  }, [erro, sucesso]);

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setSucesso('');
    const nomeLimpo = nome.trim().replace(/\s+/g, ' ');
    if (nomeLimpo.length < 2 || nomeLimpo.length > 80) {
      focarAlerta.current = true;
      setErro('Indique o nome completo (2 a 80 caracteres).');
      return;
    }
    const orgLimpa = organizacao.trim().replace(/\s+/g, ' ');
    if (orgLimpa.length > 80) {
      focarAlerta.current = true;
      setErro('Organização inválida (máx. 80 caracteres).');
      return;
    }

    setAEnviar(true);
    try {
      const resposta = await actualizarConta(
        { nome: nomeLimpo, organizacao: orgLimpa.length > 0 ? orgLimpa : null },
        token,
      );
      focarAlerta.current = true;
      setSucesso(resposta.mensagem);
      aoSucesso({
        nome: resposta.utilizador.nome,
        organizacao: resposta.utilizador.organizacao,
        mensagem: resposta.mensagem,
      });
    } catch (falha) {
      focarAlerta.current = true;
      setErro(falha instanceof Error ? falha.message : 'Não foi possível actualizar o perfil.');
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <div className="conta-ficha">
      <header className="conta-ficha-topo">
        <div>
          <h2 id={tituloId}>Editar perfil</h2>
          <p>Nome e organização da sua conta.</p>
        </div>
        <button type="button" className="conta-ficha-fechar" aria-label="Fechar" onClick={aoCancelar}>
          {ICONE_FECHAR}
        </button>
      </header>

      <dl className="conta-ficha-resumo">
        <div>
          <dt>Email</dt>
          <dd translate="no">{email}</dd>
        </div>
        <div>
          <dt>Perfil</dt>
          <dd>{ROTULO_PERFIL[perfil]}</dd>
        </div>
      </dl>

      <form
        className="conta-ficha-form"
        onSubmit={submeter}
        aria-describedby={erro ? 'perfil-erro' : sucesso ? 'perfil-ok' : undefined}
      >
        <label htmlFor="perfil-nome">Nome completo</label>
        <input
          id="perfil-nome"
          name="name"
          type="text"
          autoComplete="name"
          spellCheck={false}
          placeholder="Ex.: Paulo Baltazar"
          maxLength={80}
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          required
        />

        <label htmlFor="perfil-org">Organização</label>
        <input
          id="perfil-org"
          name="organization"
          type="text"
          autoComplete="organization"
          spellCheck={false}
          placeholder="Opcional — cooperativa, UEM…"
          maxLength={80}
          value={organizacao}
          onChange={(evento) => setOrganizacao(evento.target.value)}
        />

        {erro ? (
          <div id="perfil-erro" ref={alertaRef} tabIndex={-1} className="acesso-alerta" role="alert">
            <p>{erro}</p>
          </div>
        ) : null}
        {sucesso ? (
          <div id="perfil-ok" ref={alertaRef} tabIndex={-1} className="acesso-sucesso" role="status">
            <p>{sucesso}</p>
          </div>
        ) : null}

        <div className="conta-ficha-acoes">
          <button type="button" className="secundario" onClick={aoCancelar}>
            Cancelar
          </button>
          <button type="submit" className="primario" disabled={aEnviar || !alterado} aria-busy={aEnviar}>
            {aEnviar ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
