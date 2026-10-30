import { memo, useCallback, useState } from 'react';
import type { Ocorrencia } from './api';

export type FiltroEstado = 'todas' | Ocorrencia['status'];

const ESTADOS = new Set<string>(['TRIADA', 'ENCAMINHADA', 'VALIDADA']);

const FILTROS = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'TRIADA', rotulo: 'Triadas' },
  { id: 'ENCAMINHADA', rotulo: 'Encaminhadas' },
  { id: 'VALIDADA', rotulo: 'Validadas' },
] as const satisfies ReadonlyArray<{ id: FiltroEstado; rotulo: string }>;

const MENSAGEM_VAZIA: Record<FiltroEstado, string> = {
  todas: 'Ainda não há registos.',
  TRIADA: 'Nenhuma ocorrência triada.',
  ENCAMINHADA: 'Nenhuma ocorrência encaminhada.',
  VALIDADA: 'Nenhuma ocorrência validada.',
};

const PRIORIDADE: Record<Ocorrencia['status'], number> = {
  ENCAMINHADA: 0,
  TRIADA: 1,
  VALIDADA: 2,
};

export function lerFiltroEstado(): FiltroEstado {
  const valor = new URLSearchParams(window.location.search).get('estado');
  if (valor && ESTADOS.has(valor)) return valor as FiltroEstado;
  return 'todas';
}

function escreverFiltro(filtro: FiltroEstado) {
  const params = new URLSearchParams(window.location.search);
  params.delete('idle');
  if (filtro === 'todas') params.delete('estado');
  else params.set('estado', filtro);
  const consulta = params.toString();
  const url = consulta ? `${window.location.pathname}?${consulta}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

export function useFiltroEstado() {
  const [filtro, setFiltro] = useState(lerFiltroEstado);

  const escolher = useCallback((proximo: FiltroEstado) => {
    setFiltro(proximo);
    escreverFiltro(proximo);
  }, []);

  return { filtro, escolher };
}

export function filtrarEstado(itens: Ocorrencia[], filtro: FiltroEstado): Ocorrencia[] {
  if (filtro === 'todas' || itens.length === 0) return itens;
  const resultado: Ocorrencia[] = [];
  for (const item of itens) {
    if (item.status === filtro) resultado.push(item);
  }
  return resultado;
}

export function porDataRecente(itens: Ocorrencia[]): Ocorrencia[] {
  if (itens.length < 2) return itens;
  return [...itens].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
}

export function porPrioridade(itens: Ocorrencia[]): Ocorrencia[] {
  if (itens.length < 2) return itens;
  return [...itens].sort((a, b) => {
    const diferenca = PRIORIDADE[a.status] - PRIORIDADE[b.status];
    if (diferenca !== 0) return diferenca;
    return b.criadaEm.localeCompare(a.criadaEm);
  });
}

export function mensagemVazia(filtro: FiltroEstado): string {
  return MENSAGEM_VAZIA[filtro];
}

export type ContagensEstado = Record<FiltroEstado, number>;

export function contarEstados(itens: Ocorrencia[]): ContagensEstado {
  const contagens: ContagensEstado = { todas: itens.length, TRIADA: 0, ENCAMINHADA: 0, VALIDADA: 0 };
  for (const item of itens) contagens[item.status] += 1;
  return contagens;
}

const NUMERO = new Intl.NumberFormat('pt');

export function rotuloLista(visiveis: number, total: number, filtro: FiltroEstado): string {
  const palavra = total === 1 ? 'registo' : 'registos';
  if (filtro === 'todas') return `${NUMERO.format(total)} ${palavra}`;
  return `${NUMERO.format(visiveis)} de ${NUMERO.format(total)} ${palavra}`;
}

export const BarraFiltro = memo(function BarraFiltro({
  filtro,
  aoEscolher,
  contagens,
}: {
  filtro: FiltroEstado;
  aoEscolher: (filtro: FiltroEstado) => void;
  contagens: ContagensEstado;
}) {
  return (
    <div className="filtros filtros-segmento" role="group" aria-label="Filtrar por estado">
      {FILTROS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="chip"
          aria-pressed={filtro === item.id}
          onClick={() => aoEscolher(item.id)}
        >
          <span className="chip-rotulo">{item.rotulo}</span>
          <span className="chip-conta">{NUMERO.format(contagens[item.id])}</span>
        </button>
      ))}
    </div>
  );
});
