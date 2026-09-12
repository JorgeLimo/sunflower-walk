import { createContext, useContext, type RefObject } from 'react';

export interface AudioApi {
  audioRef: RefObject<HTMLAudioElement | null>;
  muted: boolean;
  toggleMuted: () => void;
}

export const AudioApiContext = createContext<AudioApi | null>(null);

export function useAudioApi(): AudioApi {
  const ctx = useContext(AudioApiContext);
  if (!ctx) {
    throw new Error('useAudioApi debe usarse dentro de BackgroundMusic');
  }
  return ctx;
}
