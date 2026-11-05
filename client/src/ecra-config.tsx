import { useEffect, useState, type FormEvent } from 'react';
import { actualizarConfiguracao, obterConfiguracao } from './api';

export function EcraConfig({ token }: { token: string }) {
  const [limiar, setLimiar] = useState(60);
  const [aCarregar, setACarregar] = useState(true);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setACarregar(true);
    obterConfiguracao(token)
      .then((dados) => {
        if (!ativo) return;
        setLimiar(dados.configuracao.limiarTriagem);
        setErro(null);
      })
      .catch((falha: unknown) => {
        if (!ativo) return;
        setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar a configuração.');
      })
      .finally(() => {
        if (ativo) setACarregar(false);
      });
    return () => {
      ativo = false;
    };
  }, [token]);

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    if (!Number.isInteger(limiar) || limiar < 1 || limiar > 100) {
      setErro('Indique um limiar entre 1 e 100.');
      return;
    }
    setAGuardar(true);
    try {
      const resposta = await actualizarConfiguracao(token, limiar);
      setLimiar(resposta.configuracao.limiarTriagem);
      setAviso(`Limiar de triagem actualizado para ${resposta.configuracao.limiarTriagem}\u00a0%.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível guardar.');
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <section className="gestao-acesso" aria-busy={aCarregar}>
      <header className="lista-cabeca">
        <div>
          <h1 className="titulo">Configuração</h1>
          <p className="nota">
            Parâmetros do sistema (equivalente ao Config Admin do farmOS). Só o administrador de configuração altera.
          </p>
        </div>
      </header>

      <form className="cartao gestao-formulario" onSubmit={submeter} autoComplete="off">
        <fieldset className="gestao-bloco">
          <legend>Triagem</legend>
          <div className="gestao-campos gestao-campos-2">
            <div className="form-campo">
              <label htmlFor="limiar-triagem">Limiar TRIADA (%)</label>
              <input
                id="limiar-triagem"
                name="limiarTriagem"
                type="number"
                min={1}
                max={100}
                step={1}
                value={limiar}
                disabled={aCarregar || aGuardar}
                onChange={(evento) => setLimiar(Number(evento.target.value))}
              />
            </div>
            <p className="nota gestao-config-ajuda">
              Confiança ≥ limiar → TRIADA. Abaixo → ENCAMINHADA para a fila técnica.
            </p>
          </div>
        </fieldset>
        {erro ? (
          <p className="alerta" role="alert">
            {erro}
          </p>
        ) : null}
        {aviso ? (
          <p className="sucesso" role="status" aria-live="polite">
            {aviso}
          </p>
        ) : null}
        <div className="gestao-form-rodape">
          <button type="submit" className="primario enviar" disabled={aCarregar || aGuardar} aria-busy={aGuardar}>
            {aGuardar ? 'A guardar…' : 'Guardar configuração'}
          </button>
        </div>
      </form>
    </section>
  );
}
