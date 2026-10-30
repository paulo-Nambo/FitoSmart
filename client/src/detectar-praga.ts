import { diagnosticarImagem, type Diagnostico } from './api';

export const LIMITE_FOTOS = 3;
export const TAMANHO_MAX_FICHEIRO = 12 * 1024 * 1024;

export interface ResultadoDeteccao {
  sintomas: string[];
  resumo: string;
  diagnostico: Diagnostico | null;
}

function blobDoCanvas(canvas: HTMLCanvasElement, qualidade: number) {
  return new Promise<Blob>((resolver, rejeitar) => {
    canvas.toBlob((blob) => {
      if (blob) resolver(blob);
      else rejeitar(new Error('Não foi possível gravar a fotografia.'));
    }, 'image/jpeg', qualidade);
  });
}

export async function comprimirFotografia(ficheiro: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(ficheiro);
  // 640px: mais rápido no LLaVA sem perder sintomas foliares.
  const max = 640;
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Este dispositivo não analisa fotografias.');
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return blobDoCanvas(canvas, 0.7);
}

export async function detectarPraga(
  ficheiro: Blob,
  token: string,
  cultura: string,
): Promise<ResultadoDeteccao> {
  try {
    const diagnostico = await diagnosticarImagem(token, ficheiro, cultura);
    return {
      sintomas: diagnostico.sintomas,
      resumo: diagnostico.resumo,
      diagnostico,
    };
  } catch {
    return {
      sintomas: [],
      resumo: 'Não foi possível obter o diagnóstico. Marque os sintomas à vista ou tente outra fotografia.',
      diagnostico: null,
    };
  }
}

export async function fotografiaExemplo(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este dispositivo não gera o exemplo.');
  ctx.fillStyle = '#1d4a28';
  ctx.fillRect(0, 0, 480, 360);
  ctx.fillStyle = '#3f8f4e';
  ctx.beginPath();
  ctx.ellipse(240, 180, 190, 145, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d4c01e';
  const manchas = [
    [150, 130, 34],
    [210, 90, 26],
    [280, 150, 38],
    [190, 210, 22],
    [320, 110, 28],
    [250, 240, 24],
    [120, 200, 20],
  ] as const;
  for (const [x, y, r] of manchas) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#8a5a12';
  ctx.beginPath();
  ctx.ellipse(330, 250, 48, 22, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(160, 270, 36, 16, -0.2, 0, Math.PI * 2);
  ctx.fill();
  return blobDoCanvas(canvas, 0.85);
}
