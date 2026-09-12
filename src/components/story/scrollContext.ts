import { createContext, useContext } from 'react';

export interface ScrollState {
  /** Distancia bruta acumulada (unidades de mundo), escrita directamente
   * por el listener de scroll — no tiene límite superior ni inferior. */
  rawDistance: number;
  /** Distancia suavizada (con inercia). Cámara y personajes usan esta. */
  smoothDistance: number;
  /** Velocidad suavizada (unidades de mundo / segundo). Puede ser negativa. */
  velocity: number;
}

export interface ScrollStateRef {
  current: ScrollState;
}

export const ScrollStateContext = createContext<ScrollStateRef | null>(null);

export function useScrollState(): ScrollStateRef {
  const ctx = useContext(ScrollStateContext);
  if (!ctx) {
    throw new Error('useScrollState debe usarse dentro de un ScrollController');
  }
  return ctx;
}
