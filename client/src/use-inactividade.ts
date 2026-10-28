import { useEffect, useRef } from 'react';

export const MINUTOS_INACTIVIDADE = 10;
const LIMITE_MS = MINUTOS_INACTIVIDADE * 60 * 1000;
const CHAVE = 'fitosmart.actividade.v1';
const EVENTOS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;

function marcarActividade() {
  try {
    localStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    /* o modo privado pode bloquear o armazenamento */
  }
}

function lerActividade(): number {
  try {
    const valor = Number(localStorage.getItem(CHAVE) ?? 0);
    return Number.isFinite(valor) ? valor : 0;
  } catch {
    return 0;
  }
}

export function useInactividade(activo: boolean, aoExpirar: () => void) {
  const aoExpirarRef = useRef(aoExpirar);
  aoExpirarRef.current = aoExpirar;

  useEffect(() => {
    if (!activo) return;
    let aTerminar = false;
    let ultimaEscrita = 0;
    marcarActividade();

    const naActividade = () => {
      const agora = Date.now();
      if (agora - ultimaEscrita < 1000) return;
      ultimaEscrita = agora;
      marcarActividade();
    };

    const verificar = () => {
      if (aTerminar || document.visibilityState === 'hidden') return;
      const ultima = lerActividade();
      if (ultima === 0 || Date.now() - ultima < LIMITE_MS) return;
      aTerminar = true;
      aoExpirarRef.current();
    };

    for (const evento of EVENTOS) {
      window.addEventListener(evento, naActividade, { passive: true });
    }
    document.addEventListener('visibilitychange', verificar);
    const relogio = window.setInterval(verificar, 15_000);

    return () => {
      for (const evento of EVENTOS) {
        window.removeEventListener(evento, naActividade);
      }
      document.removeEventListener('visibilitychange', verificar);
      window.clearInterval(relogio);
    };
  }, [activo]);
}
