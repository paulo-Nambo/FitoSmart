import { lazy, memo, Suspense, useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Ocorrencia } from './api';
import { ResumoOcorrencias, rotuloSintoma } from './cartao-ocorrencia';
import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { BarXAxis } from '@/components/charts/bar-x-axis';
import { chartCssVars } from '@/components/charts/chart-context';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';

const GraficoEstados = lazy(() =>
  import('./grafico-estados').then((modulo) => ({ default: modulo.GraficoEstados })),
);

const NUMERO = new Intl.NumberFormat('pt');
const PERCENTAGEM = new Intl.NumberFormat('pt', { maximumFractionDigits: 0 });
const CULTURAS = ['Milho', 'Mandioca', 'Feijão', 'Tomate'] as const;
const SINTOMAS = ['manchas_amarelas', 'folhas_secas', 'murcha', 'pragas_visiveis'] as const;
const RESERVA = <p className="nota">A carregar o gráfico…</p>;
const DIA_MS = 24 * 60 * 60 * 1000;

const GraficoCulturas = memo(function GraficoCulturas({ ocorrencias }: { ocorrencias: Ocorrencia[] }) {
  const dados = useMemo(() => {
    const contagem = Object.fromEntries(CULTURAS.map((cultura) => [cultura, 0])) as Record<string, number>;
    for (const item of ocorrencias) {
      if (CULTURAS.includes(item.cultura as (typeof CULTURAS)[number])) {
        contagem[item.cultura] += 1;
      }
    }
    return CULTURAS.map((cultura) => ({ cultura, total: contagem[cultura] ?? 0 }));
  }, [ocorrencias]);
  const reduzido = useReducedMotion();
  const assinatura = dados.map((item) => item.total).join('-');

  return (
    <section className="cartao painel-grafico" aria-label="Gráfico por cultura">
      <h2 className="titulo">Culturas</h2>
      <BarChart
        data={dados}
        xDataKey="cultura"
        animationDuration={reduzido ? 0 : 1100}
        revealSignature={assinatura}
        aspectRatio="2.2 / 1"
      >
        <Grid horizontal />
        <Bar
          dataKey="total"
          fill={chartCssVars.lineSecondary}
          lineCap="round"
          showValue
          valueLabelFormatter={(valor) => NUMERO.format(valor)}
        />
        <BarXAxis />
        <ChartTooltip
          rows={(ponto) => [
            {
              color: chartCssVars.lineSecondary,
              label: 'Ocorrências',
              value: NUMERO.format(Number(ponto.total)),
            },
          ]}
        />
      </BarChart>
    </section>
  );
});

const RankingSintomas = memo(function RankingSintomas({ ocorrencias }: { ocorrencias: Ocorrencia[] }) {
  const linhas = useMemo(() => {
    const contagem = Object.fromEntries(SINTOMAS.map((id) => [id, 0])) as Record<string, number>;
    for (const item of ocorrencias) {
      for (const sintoma of item.sintomas) {
        if (sintoma in contagem) contagem[sintoma] += 1;
      }
    }
    const maximo = Math.max(1, ...Object.values(contagem));
    return SINTOMAS.map((id) => ({
      id,
      rotulo: rotuloSintoma(id),
      total: contagem[id],
      percentagem: ocorrencias.length === 0 ? 0 : Math.round((contagem[id] / ocorrencias.length) * 100),
      largura: Math.round((contagem[id] / maximo) * 100),
    })).sort((a, b) => b.total - a.total);
  }, [ocorrencias]);

  return (
    <section className="cartao painel-ranking" aria-label="Sintomas mais frequentes">
      <h2 className="titulo">Sintomas</h2>
      <p className="nota painel-ranking-nota">Frequência nos registos (um caso pode ter vários).</p>
      <ul className="ranking-sintomas">
        {linhas.map((linha) => (
          <li key={linha.id}>
            <div className="ranking-cabeca">
              <span>{linha.rotulo}</span>
              <strong className="numero">
                {NUMERO.format(linha.total)}
                <span className="ranking-pct">{PERCENTAGEM.format(linha.percentagem)}&nbsp;%</span>
              </strong>
            </div>
            <div
              className="ranking-barra"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={linha.largura}
              aria-label={linha.rotulo}
            >
              <span style={{ width: `${linha.largura}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
});

const IndicadoresExtra = memo(function IndicadoresExtra({ ocorrencias }: { ocorrencias: Ocorrencia[] }) {
  const indicadores = useMemo(() => {
    const agora = Date.now();
    let somaConfianca = 0;
    let comFoto = 0;
    let ultimas24h = 0;
    let ultimos7d = 0;
    let baixaConfianca = 0;

    for (const item of ocorrencias) {
      somaConfianca += item.confianca;
      if ((item.imagens?.length ?? 0) > 0) comFoto += 1;
      if (item.confianca < 60) baixaConfianca += 1;
      const criada = new Date(item.criadaEm).getTime();
      if (!Number.isNaN(criada)) {
        const idade = agora - criada;
        if (idade <= DIA_MS) ultimas24h += 1;
        if (idade <= 7 * DIA_MS) ultimos7d += 1;
      }
    }

    const total = ocorrencias.length;
    const confiancaMedia = total === 0 ? 0 : Math.round(somaConfianca / total);
    const taxaValidada =
      total === 0 ? 0 : Math.round((ocorrencias.filter((item) => item.status === 'VALIDADA').length / total) * 100);

    return [
      { rotulo: 'Confiança média', valor: `${PERCENTAGEM.format(confiancaMedia)}\u00a0%` },
      { rotulo: 'Taxa validada', valor: `${PERCENTAGEM.format(taxaValidada)}\u00a0%` },
      { rotulo: 'Com fotografia', valor: NUMERO.format(comFoto) },
      { rotulo: 'Baixa confiança', valor: NUMERO.format(baixaConfianca) },
      { rotulo: 'Últimas 24 h', valor: NUMERO.format(ultimas24h) },
      { rotulo: 'Últimos 7 dias', valor: NUMERO.format(ultimos7d) },
    ];
  }, [ocorrencias]);

  return (
    <section className="resumo resumo-extra" aria-label="Indicadores adicionais">
      {indicadores.map((item) => (
        <article key={item.rotulo}>
          <strong className="numero">{item.valor}</strong>
          <span>{item.rotulo}</span>
        </article>
      ))}
    </section>
  );
});

export const PainelEstatisticas = memo(function PainelEstatisticas({
  ocorrencias,
}: {
  ocorrencias: Ocorrencia[];
}) {
  return (
    <div className="painel-estatisticas">
      <ResumoOcorrencias ocorrencias={ocorrencias} />
      <IndicadoresExtra ocorrencias={ocorrencias} />
      <div className="painel-grelha">
        <Suspense fallback={RESERVA}>
          <GraficoEstados ocorrencias={ocorrencias} />
        </Suspense>
        <Suspense fallback={RESERVA}>
          <GraficoCulturas ocorrencias={ocorrencias} />
        </Suspense>
      </div>
      <RankingSintomas ocorrencias={ocorrencias} />
    </div>
  );
});
