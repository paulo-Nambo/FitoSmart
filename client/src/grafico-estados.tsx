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

function contarEstados(ocorrencias: Ocorrencia[]) {
  const totais = { TRIADA: 0, ENCAMINHADA: 0, VALIDADA: 0 };
  for (const item of ocorrencias) totais[item.status] += 1;
  return [
    { estado: 'Triadas', total: totais.TRIADA },
    { estado: 'Encaminhadas', total: totais.ENCAMINHADA },
    { estado: 'Validadas', total: totais.VALIDADA },
  ];
}

export const GraficoEstados = memo(function GraficoEstados({ ocorrencias }: { ocorrencias: Ocorrencia[] }) {
  const dados = useMemo(() => contarEstados(ocorrencias), [ocorrencias]);
  const reduzido = useReducedMotion();
  const assinatura = `${dados[0].total}-${dados[1].total}-${dados[2].total}`;

  return (
    <section className="cartao painel-grafico" aria-label="Gráfico dos estados">
      <h2 className="titulo">Estados</h2>
      <BarChart
        data={dados}
        xDataKey="estado"
        animationDuration={reduzido ? 0 : 1100}
        revealSignature={assinatura}
        aspectRatio="2.2 / 1"
      >
        <Grid horizontal />
        <Bar
          dataKey="total"
          fill={chartCssVars.linePrimary}
          lineCap="round"
          showValue
          valueLabelFormatter={(valor) => NUMERO.format(valor)}
        />
        <BarXAxis />
        <ChartTooltip
          rows={(ponto) => [
            {
              color: chartCssVars.linePrimary,
              label: 'Ocorrências',
              value: NUMERO.format(Number(ponto.total)),
            },
          ]}
        />
      </BarChart>
    </section>
  );
});
