import { createContext, useContext, type RefObject } from 'react';

export interface AudioApi {
  audioRef: RefObject<HTMLAudioElement | null>;
  muted: boolean;
  toggleMuted: () => void;
  /** Cuántas canciones hay disponibles en la secuencia (mínimo 1). */
  trackCount: number;
  /** Volumen maestro de la música, de 0 a 1 (se mantiene entre canciones). */
  volume: number;
  setVolume: (volume: number) => void;
}

export const AudioApiContext = createContext<AudioApi | null>(null);

export function useAudioApi(): AudioApi {
  const ctx = useContext(AudioApiContext);
  if (!ctx) {
    throw new Error('useAudioApi debe usarse dentro de BackgroundMusic');
  }
  return ctx;
}
