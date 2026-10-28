import { memo, useEffect, useState, type ReactNode } from 'react';
import { obterImagem, urlDaImagem, type Ocorrencia } from './api';

const ROTULOS_SINTOMA: Record<string, string> = {
  manchas_amarelas: 'Manchas amarelas',
  folhas_secas: 'Folhas secas',
  murcha: 'Murcha',
  pragas_visiveis: 'Pragas visíveis',
};

const COORDENADA = new Intl.NumberFormat('pt', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATA = new Intl.DateTimeFormat('pt', { dateStyle: 'medium', timeStyle: 'short' });
const PERCENTAGEM = new Intl.NumberFormat('pt');

const RECOMENDACAO: Record<Ocorrencia['status'], string> = {
  TRIADA: 'A ficha base confirma o padrão. Isole as plantas afectadas e acompanhe o talhão.',
  ENCAMINHADA: 'A confiança ficou abaixo de 60%. Aguarde a revisão de um técnico.',
  VALIDADA: 'Um técnico confirmou o caso. Mantenha o acompanhamento no talhão.',
};

function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return DATA.format(data);
}

export function ligaMapa(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(5);
  const lng = longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`;
}

export function rotuloSintoma(id: string): string {
  return ROTULOS_SINTOMA[id] ?? id;
}

const ROTULOS_RESUMO = [
  { chave: 'total', rotulo: 'Registos' },
  { chave: 'TRIADA', rotulo: 'Triadas' },
  { chave: 'ENCAMINHADA', rotulo: 'Encaminhadas' },
  { chave: 'VALIDADA', rotulo: 'Validadas' },
] as const;

export const ResumoOcorrencias = memo(function ResumoOcorrencias({
  ocorrencias,
}: {
  ocorrencias: Ocorrencia[];
}) {
  const contagem = { total: ocorrencias.length, TRIADA: 0, ENCAMINHADA: 0, VALIDADA: 0 };
  for (const item of ocorrencias) {
    contagem[item.status] += 1;
  }

  return (
    <section className="resumo" aria-label="Resumo das ocorrências">
      {ROTULOS_RESUMO.map((item) => (
        <article key={item.chave}>
          <strong className="numero">{contagem[item.chave]}</strong>
          <span>{item.rotulo}</span>
        </article>
      ))}
    </section>
  );
});

const FotoAutenticada = memo(function FotoAutenticada({
  token,
  caminho,
  alt,
}: {
  token: string;
  caminho: string;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let ativo = true;
    obterImagem(token, caminho)
      .then((blob) => {
        if (!ativo) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (ativo) setUrl(null);
      });
    return () => {
      ativo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [caminho, token]);

  return (
    <span className={url ? 'item-miniatura' : 'item-miniatura a-carregar'}>
      {url ? <img src={url} alt={alt} width={160} height={160} /> : <span className="sr-only">A carregar fotografia…</span>}
    </span>
  );
});

const GaleriaFotos = memo(function GaleriaFotos({
  token,
  id,
  nomes,
}: {
  token: string;
  id: string;
  nomes: string[];
}) {
  return (
    <ul className="item-fotos">
      {nomes.map((nome, indice) => (
        <li key={nome}>
          <FotoAutenticada
            token={token}
            caminho={urlDaImagem(id, nome)}
            alt={`Fotografia ${indice + 1} da ocorrência`}
          />
        </li>
      ))}
    </ul>
  );
});

export const CartaoOcorrencia = memo(function CartaoOcorrencia({
  token,
  ocorrencia,
  acao,
}: {
  token: string;
  ocorrencia: Ocorrencia;
  acao?: ReactNode;
}) {
  const quando = formatarData(ocorrencia.criadaEm);
  const fotos = ocorrencia.imagens ?? [];
  const mapa = ligaMapa(ocorrencia.latitude, ocorrencia.longitude);
  const local = `${COORDENADA.format(ocorrencia.latitude)}, ${COORDENADA.format(ocorrencia.longitude)}`;

  return (
    <article className={`item estado-${ocorrencia.status.toLowerCase()}${fotos.length > 0 ? ' item-com-foto' : ''}`}>
      {fotos.length > 0 ? <GaleriaFotos token={token} id={ocorrencia.id} nomes={fotos} /> : null}
      <div className="item-corpo">
        <header>
          <strong className="quebrar">{ocorrencia.cultura}</strong>
          <span className="selo" translate="no">
            {ocorrencia.status}
          </span>
        </header>
        <ul className="item-sintomas">
          {ocorrencia.sintomas.map((id) => (
            <li key={id} className="item-sintoma">
              {rotuloSintoma(id)}
            </li>
          ))}
        </ul>
        <dl className="item-factos">
          {quando ? (
            <div>
              <dt>Registo</dt>
              <dd>
                <time dateTime={ocorrencia.criadaEm}>{quando}</time>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Confiança</dt>
            <dd className="numero">{PERCENTAGEM.format(ocorrencia.confianca)}&nbsp;%</dd>
          </div>
          <div>
            <dt>Local</dt>
            <dd>
              <a className="ligacao" href={mapa} target="_blank" rel="noopener noreferrer">
                {local}
              </a>
            </dd>
          </div>
          {ocorrencia.autorEmail ? (
            <div>
              <dt>Conta</dt>
              <dd className="quebrar" translate="no">
                {ocorrencia.autorEmail}
              </dd>
            </div>
          ) : null}
        </dl>
        <div
          className="progresso"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ocorrencia.confianca}
          aria-label="Confiança da triagem"
        >
          <span style={{ width: `${ocorrencia.confianca}%` }} />
        </div>
        <p className="nota">{RECOMENDACAO[ocorrencia.status]}</p>
        {acao ? <div className="item-rodape">{acao}</div> : null}
      </div>
    </article>
  );
});
