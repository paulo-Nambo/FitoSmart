import { memo, useState, type FormEvent } from 'react';
import { registarOcorrencia, type Ocorrencia } from './api';
import { CartaoOcorrencia } from './cartao-ocorrencia';

const CULTURAS = ['Milho', 'Mandioca', 'Feijão', 'Tomate'] as const;

const SINTOMAS = [
  { id: 'manchas_amarelas', rotulo: 'Manchas amarelas' },
  { id: 'folhas_secas', rotulo: 'Folhas secas' },
  { id: 'murcha', rotulo: 'Murcha' },
  { id: 'pragas_visiveis', rotulo: 'Pragas visíveis' },
] as const;

const NOTA_FICHA = (
  <p className="nota">
    A ficha base compara os sintomas com manchas amarelas e folhas secas. Abaixo de 60% o caso segue para um técnico.
  </p>
);

const LISTA_VAZIA = <p className="nota">Ainda não há registos nesta sessão.</p>;

interface EcraOcorrenciaProps {
  token: string;
  ocorrencias: Ocorrencia[];
  aoRegistar: (ocorrencia: Ocorrencia, mensagem?: string) => void;
}

const ListaOcorrencias = memo(function ListaOcorrencias({ ocorrencias }: { ocorrencias: Ocorrencia[] }) {
  const recentes = ocorrencias.length === 0 ? ocorrencias : [...ocorrencias].reverse();

  return (
    <section className="cartao lista">
      <h2>As suas ocorrências</h2>
      {recentes.length === 0 ? (
        LISTA_VAZIA
      ) : (
        <ul>
          {recentes.map((item) => (
            <li key={item.id}>
              <CartaoOcorrencia ocorrencia={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

export function EcraOcorrencia({ token, ocorrencias, aoRegistar }: EcraOcorrenciaProps) {
  const [cultura, setCultura] = useState<(typeof CULTURAS)[number]>('Milho');
  const [sintomas, setSintomas] = useState<string[]>([]);
  const [latitude, setLatitude] = useState('-25.96');
  const [longitude, setLongitude] = useState('32.58');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  function alternarSintoma(id: string) {
    setSintomas((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  }

  async function submeter(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (sintomas.length === 0) {
      setErro('Deve informar ao menos 1 sintoma');
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setErro('Latitude fora dos limites (-90 a 90)');
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setErro('Longitude fora dos limites (-180 a 180)');
      return;
    }

    setAEnviar(true);
    try {
      const resposta = await registarOcorrencia(token, {
        cultura,
        sintomas,
        latitude: lat,
        longitude: lng,
      });
      aoRegistar(resposta.ocorrencia, resposta.mensagem);
      setAviso(resposta.mensagem ?? `Ocorrência triada com ${resposta.ocorrencia.confianca}% de confiança.`);
      setSintomas([]);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha ao registar');
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <div className="grelha">
      <form className="cartao" onSubmit={submeter}>
        <h2>Nova ocorrência</h2>
        {NOTA_FICHA}
        <label htmlFor="cultura">Cultura</label>
        <select
          id="cultura"
          value={cultura}
          onChange={(evento) => setCultura(evento.target.value as (typeof CULTURAS)[number])}
        >
          {CULTURAS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <fieldset>
          <legend>Sintomas</legend>
          <div className="sintomas">
            {SINTOMAS.map((item) => (
              <label key={item.id} className="check">
                <input
                  type="checkbox"
                  checked={sintomas.includes(item.id)}
                  onChange={() => alternarSintoma(item.id)}
                />
                {item.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="par">
          <div>
            <label htmlFor="latitude">Latitude</label>
            <input
              id="latitude"
              inputMode="decimal"
              value={latitude}
              onChange={(evento) => setLatitude(evento.target.value)}
            />
          </div>
          <div>
            <label htmlFor="longitude">Longitude</label>
            <input
              id="longitude"
              inputMode="decimal"
              value={longitude}
              onChange={(evento) => setLongitude(evento.target.value)}
            />
          </div>
        </div>
        {erro ? <p className="alerta">{erro}</p> : null}
        {aviso ? <p className="sucesso">{aviso}</p> : null}
        <button type="submit" className="primario" disabled={aEnviar}>
          {aEnviar ? 'A enviar…' : 'Submeter ocorrência'}
        </button>
      </form>
      <ListaOcorrencias ocorrencias={ocorrencias} />
    </div>
  );
}
