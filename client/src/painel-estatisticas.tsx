import { lazy, memo, Suspense, useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Ocorrencia } from './api';
import { ResumoOcorrencias } from './cartao-ocorrencia';
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
    <section className="painel-grafico" aria-label="Gráfico por cultura">
      <h2 className="titulo">Culturas</h2>
      <BarChart
        data={dados}
        xDataKey="cultura"
        animationDuration={reduzido ? 0 : 1100}
        revealSignature={assinatura}
        aspectRatio="2.2 / 1"
        className="painel-chart"
      >
        <Grid horizontal />
        <Bar
          dataKey="total"
          fill={chartCssVars.lineSecondary}
          lineCap="round"
          showValue
          valueLabelFormatter={(valor) => NUMERO.format(valor)}
        />
        <BarXAxis showAllLabels />
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

const IndicadoresChave = memo(function IndicadoresChave({ ocorrencias }: { ocorrencias: Ocorrencia[] }) {
  const indicadores = useMemo(() => {
    const agora = Date.now();
    let somaConfianca = 0;
    let ultimas24h = 0;
    for (const item of ocorrencias) {
      somaConfianca += item.confianca;
      const criada = new Date(item.criadaEm).getTime();
      if (!Number.isNaN(criada) && agora - criada <= DIA_MS) ultimas24h += 1;
    }
    const total = ocorrencias.length;
    const confiancaMedia = total === 0 ? 0 : Math.round(somaConfianca / total);
    const taxaValidada =
      total === 0
        ? 0
        : Math.round((ocorrencias.filter((item) => item.status === 'VALIDADA').length / total) * 100);

    return [
      {
        id: 'confianca',
        rotulo: 'Confiança média',
        valor: `${PERCENTAGEM.format(confiancaMedia)}\u00a0%`,
      },
      {
        id: 'taxa',
        rotulo: 'Taxa validada',
        valor: `${PERCENTAGEM.format(taxaValidada)}\u00a0%`,
      },
      {
        id: 'recentes',
        rotulo: 'Últimas 24 h',
        valor: NUMERO.format(ultimas24h),
      },
    ];
  }, [ocorrencias]);

  return (
    <section className="resumo resumo-chave" aria-label="Indicadores principais">
      {indicadores.map((item) => (
        <article key={item.id} className={`resumo-card resumo-kpi resumo-kpi-${item.id}`}>
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
      <p className="painel-intro">
        Visão rápida do estado das ocorrências e da actividade recente.
      </p>
      <ResumoOcorrencias ocorrencias={ocorrencias} />
      <IndicadoresChave ocorrencias={ocorrencias} />
      <div className="painel-grelha">
        <Suspense fallback={RESERVA}>
          <GraficoEstados ocorrencias={ocorrencias} />
        </Suspense>
        <Suspense fallback={RESERVA}>
          <GraficoCulturas ocorrencias={ocorrencias} />
        </Suspense>
      </div>
    </div>
  );
});
