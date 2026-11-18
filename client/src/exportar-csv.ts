import { rotuloSeveridade, rotuloSintoma } from './cartao-ocorrencia';
import type { Ocorrencia } from './api';

function escaparCsv(valor: string): string {
  if (/[;"\n\r]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

function celula(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return escaparCsv(String(valor));
}

/** Gera CSV (UTF-8 BOM, `;`) e dispara o download no browser. */
export function exportarOcorrenciasCsv(ocorrencias: Ocorrencia[], nomeFicheiro = 'ocorrencias-fitosmart.csv'): void {
  const cabecalho = [
    'id',
    'cultura',
    'status',
    'confianca',
    'severidade',
    'latitude',
    'longitude',
    'parcela',
    'referencia',
    'autor',
    'criada_em',
    'validada_em',
    'validada_por',
    'nota_validacao',
    'sintomas',
  ];

  const linhas = ocorrencias.map((item) =>
    [
      celula(item.id),
      celula(item.cultura),
      celula(item.status),
      celula(item.confianca),
      celula(item.severidade === null ? '' : `${item.severidade} (${rotuloSeveridade(item.severidade)})`),
      celula(item.latitude),
      celula(item.longitude),
      celula(item.parcelaNome),
      celula(item.referenciaRotulo),
      celula(item.autorNome || item.autorEmail),
      celula(item.criadaEm),
      celula(item.validadaEm),
      celula(item.validadaPor),
      celula(item.notaValidacao),
      celula(item.sintomas.map((id) => rotuloSintoma(id)).join(' | ')),
    ].join(';'),
  );

  const csv = `\uFEFF${[cabecalho.join(';'), ...linhas].join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const ligacao = document.createElement('a');
  ligacao.href = url;
  ligacao.download = nomeFicheiro;
  ligacao.rel = 'noopener';
  document.body.appendChild(ligacao);
  ligacao.click();
  ligacao.remove();
  URL.revokeObjectURL(url);
}
