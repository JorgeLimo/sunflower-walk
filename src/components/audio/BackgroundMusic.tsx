import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioApiContext, useAudioApi } from './AudioContext';
import { songBubbleStore } from '../../lib/songBubbleStore';
import styles from './BackgroundMusic.module.scss';

// `BASE_URL` incluye siempre la barra final (Vite lo garantiza) — en dev es
// '/' y en producción (GitHub Pages) es '/sunflower-walk/', así que una ruta
// absoluta fija acá se rompería apenas la app no vive en la raíz del sitio.
const trackUrl = (index: number) =>
  `${import.meta.env.BASE_URL}audio/audio-music${index === 0 ? '' : `-${index}`}.mp3`;
const TRACK_SRC = trackUrl(0);

// Tope de seguridad al buscar `audio-music-1.mp3`, `-2.mp3`, ... — la
// secuencia se arma sola con los archivos que existan en `public/audio`.
const MAX_TRACKS = 30;
const CROSSFADE_MS = 1600;

/** Prueba `audio-music-N.mp3` en orden hasta el primero que no exista. El
 * servidor de desarrollo responde con el index.html (text/html) a rutas
 * inexistentes, así que además del status se mira el tipo de contenido. */
async function discoverTracks(): Promise<string[]> {
  const found = [TRACK_SRC];
  for (let i = 1; i < MAX_TRACKS; i++) {
    try {
      const res = await fetch(trackUrl(i), { method: 'HEAD' });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !(type.startsWith('audio') || type === 'application/octet-stream')) break;
      found.push(trackUrl(i));
    } catch {
      break;
    }
  }
  return found;
}

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
  const [trackCount, setTrackCount] = useState(1);
  const tracksRef = useRef<string[]>([TRACK_SRC]);
  const indexRef = useRef(0);
  const switchingRef = useRef(false);
  const mutedRef = useRef(false);
  const fadingOutRef = useRef<HTMLAudioElement | null>(null);

  const toggleMuted = () => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.muted = next;
      if (fadingOutRef.current) fadingOutRef.current.muted = next;
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    discoverTracks().then((tracks) => {
      if (cancelled) return;
      tracksRef.current = tracks;
      setTrackCount(tracks.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Pasa a la siguiente canción (y vuelve a la primera tras la última)
   * con un fundido cruzado: la nueva empieza en silencio y sube mientras la
   * actual baja, así nunca hay un corte seco ni un hueco sin música. El
   * elemento activo pasa a ser el nuevo `<audio>` (`audioRef.current`), de
   * modo que el silenciar/reactivar existente sigue funcionando igual. */
  const nextTrack = useCallback(() => {
    const tracks = tracksRef.current;
    const outgoing = audioRef.current;
    if (tracks.length < 2 || !outgoing || switchingRef.current) return;
    switchingRef.current = true;

    const nextIndex = (indexRef.current + 1) % tracks.length;
    const incoming = new Audio(tracks[nextIndex]);
    incoming.loop = true;
    incoming.preload = 'auto';
    incoming.volume = 0;
    incoming.muted = mutedRef.current;

    incoming
      .play()
      .then(() => {
        indexRef.current = nextIndex;
        audioRef.current = incoming;
        fadingOutRef.current = outgoing;
        const startVolume = outgoing.volume;
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min((now - t0) / CROSSFADE_MS, 1);
          // Curva de potencia constante aproximada: la suma de volúmenes
          // se mantiene pareja a lo largo del fundido.
          incoming.volume = Math.sin((p * Math.PI) / 2);
          outgoing.volume = startVolume * Math.cos((p * Math.PI) / 2);
          if (p < 1) {
            requestAnimationFrame(step);
            return;
          }
          outgoing.pause();
          outgoing.volume = startVolume;
          fadingOutRef.current = null;
          switchingRef.current = false;
        };
        requestAnimationFrame(step);
      })
      .catch(() => {
        // El navegador bloqueó la reproducción: se queda la canción actual.
        incoming.removeAttribute('src');
        switchingRef.current = false;
      });
  }, [audioRef]);

  useEffect(() => songBubbleStore.registerNextTrack(nextTrack), [nextTrack]);

  return (
    <AudioApiContext.Provider value={{ audioRef, muted, toggleMuted, trackCount }}>
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
