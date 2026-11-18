import { rotuloSintoma } from './cartao-ocorrencia';
import type { Ocorrencia } from './api';

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt');
}

/** Pesquisa livre em cultura, sintomas, parcela, referência e autor. */
export function filtrarPesquisa(ocorrencias: Ocorrencia[], pesquisa: string): Ocorrencia[] {
  const termo = normalizar(pesquisa.trim());
  if (!termo) return ocorrencias;

  return ocorrencias.filter((item) => {
    const sintomas = item.sintomas.map((id) => rotuloSintoma(id)).join(' ');
    const haystack = normalizar(
      [
        item.cultura,
        sintomas,
        item.parcelaNome ?? '',
        item.referenciaRotulo ?? '',
        item.autorEmail ?? '',
        item.autorNome ?? '',
        item.status,
        item.notaValidacao ?? '',
        item.validadaPor ?? '',
      ].join(' '),
    );
    return haystack.includes(termo);
  });
}
