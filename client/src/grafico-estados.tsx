import { memo, useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Ocorrencia } from './api';
import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { BarXAxis } from '@/components/charts/bar-x-axis';
import { chartCssVars } from '@/components/charts/chart-context';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';

const NUMERO = new Intl.NumberFormat('pt');

const COR_ESTADO = {
  TRIADA: '#1a7a4c',
  ENCAMINHADA: '#9a6700',
  VALIDADA: '#175cd3',
} as const;

function contarEstados(ocorrencias: Ocorrencia[]) {
  const totais = { TRIADA: 0, ENCAMINHADA: 0, VALIDADA: 0 };
  for (const item of ocorrencias) totais[item.status] += 1;
  return [
    { estado: 'Triadas', total: totais.TRIADA, cor: COR_ESTADO.TRIADA },
    { estado: 'Encaminh.', total: totais.ENCAMINHADA, cor: COR_ESTADO.ENCAMINHADA },
    { estado: 'Validadas', total: totais.VALIDADA, cor: COR_ESTADO.VALIDADA },
  ];
}

export const GraficoEstados = memo(function GraficoEstados({ ocorrencias }: { ocorrencias: Ocorrencia[] }) {
  const dados = useMemo(() => contarEstados(ocorrencias), [ocorrencias]);
  const reduzido = useReducedMotion();
  const assinatura = `${dados[0].total}-${dados[1].total}-${dados[2].total}`;

  return (
    <section className="painel-grafico" aria-label="Gráfico dos estados">
      <h2 className="titulo">Estados</h2>
      <BarChart
        data={dados}
        xDataKey="estado"
        animationDuration={reduzido ? 0 : 1100}
        revealSignature={assinatura}
        aspectRatio="2.2 / 1"
        className="painel-chart"
      >
        <Grid horizontal />
        <Bar
          dataKey="total"
          fillKey="cor"
          fill={chartCssVars.linePrimary}
          lineCap="round"
          showValue
          valueLabelFormatter={(valor) => NUMERO.format(valor)}
        />
        <BarXAxis showAllLabels />
        <ChartTooltip
          rows={(ponto) => [
            {
              color: typeof ponto.cor === 'string' ? ponto.cor : chartCssVars.linePrimary,
              label: 'Ocorrências',
              value: NUMERO.format(Number(ponto.total)),
            },
          ]}
        />
      </BarChart>
    </section>
  );
});
