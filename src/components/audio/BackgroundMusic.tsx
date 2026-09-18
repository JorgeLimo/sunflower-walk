import { useRef, useState, type ReactNode } from 'react';
import { AudioApiContext, useAudioApi } from './AudioContext';
import styles from './BackgroundMusic.module.scss';

// `BASE_URL` incluye siempre la barra final (Vite lo garantiza) — en dev es
// '/' y en producción (GitHub Pages) es '/sunflower-walk/', así que una ruta
// absoluta fija acá se rompería apenas la app no vive en la raíz del sitio.
const TRACK_SRC = `${import.meta.env.BASE_URL}audio/audio-music.mp3`;

interface BackgroundMusicProps {
  children: ReactNode;
}

/**
 * Provee el elemento <audio> y el estado de silencio a toda la app. La
 * reproducción real solo se dispara desde `IntroScreen`, dentro del click
 * de "Entrar", para cumplir con las políticas de autoplay del navegador.
 * Pausar/silenciar nunca detiene las animaciones 3D: son sistemas
 * independientes.
 */
export function BackgroundMusic({ children }: BackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);

  const toggleMuted = () => {
    setMuted((prev) => {
      const next = !prev;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  };

  return (
    <AudioApiContext.Provider value={{ audioRef, muted, toggleMuted }}>
      <audio ref={audioRef} src={TRACK_SRC} loop preload="auto" />
      {children}
    </AudioApiContext.Provider>
  );
}

/** Botón discreto para silenciar/reactivar la música. */
export function MusicToggleButton() {
  const { muted, toggleMuted } = useAudioApi();

  return (
    <button
      type="button"
      className={styles.toggle}
      data-muted={muted}
      onClick={toggleMuted}
      aria-pressed={muted}
      title={muted ? 'Activar música' : 'Silenciar música'}
    >
      <span className={styles.bars} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </button>
  );
}
