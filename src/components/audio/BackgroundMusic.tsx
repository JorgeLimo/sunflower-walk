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
// La música siempre arranca al 50%; el usuario lo ajusta con `VolumeControl`.
const INITIAL_VOLUME = 0.5;
const CROSSFADE_MS = 1600;

/** `HTMLMediaElement.volume` lanza `IndexSizeError` fuera de [0, 1] — y un
 * seno/coseno con un `p` apenas fuera de rango (o el resto de punto
 * flotante de `cos(π/2)`) puede dar -0.0007 — así que TODO volumen que se
 * asigna pasa por acá. */
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

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
  const [volume, setVolumeState] = useState(INITIAL_VOLUME);
  // Volumen "maestro": el fundido cruzado lo lee en cada cuadro, así que
  // moverlo durante un cambio de canción se aplica al instante y el
  // volumen elegido se mantiene en la canción nueva.
  const volumeRef = useRef(volume);
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

  const setVolume = useCallback(
    (next: number) => {
      const v = clamp01(next);
      volumeRef.current = v;
      setVolumeState(v);
      // Durante un fundido cruzado los dos elementos los maneja `step`.
      if (!switchingRef.current && audioRef.current) audioRef.current.volume = v;
    },
    [audioRef],
  );

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volumeRef.current;
  }, [audioRef]);

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
        const t0 = performance.now();
        const step = (now: number) => {
          // `now` (marca de tiempo del cuadro) puede ser anterior a `t0`, que se
          // toma con `performance.now()` ya empezado el cuadro: sin acotar,
          // `p` daba negativo y el volumen también.
          const p = clamp01((now - t0) / CROSSFADE_MS);
          // Curva de potencia constante aproximada: la suma de volúmenes
          // se mantiene pareja a lo largo del fundido.
          const master = clamp01(volumeRef.current);
          incoming.volume = clamp01(master * Math.sin((p * Math.PI) / 2));
          outgoing.volume = clamp01(master * Math.cos((p * Math.PI) / 2));
          if (p < 1) {
            requestAnimationFrame(step);
            return;
          }
          outgoing.pause();
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
    <AudioApiContext.Provider value={{ audioRef, muted, toggleMuted, trackCount, volume, setVolume }}>
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

/** Icono de parlante: las ondas se apagan a medida que baja el volumen. */
function VolumeIcon({ level }: { level: number }) {
  return (
    <svg className={styles.volumeIcon} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M4 9.5h3.2L11.5 6v12L7.2 14.5H4z" fill="currentColor" />
      {level > 0 && level <= 0.5 && (
        <path d="M14.5 9.6a3.6 3.6 0 0 1 0 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
      {level > 0.5 && (
        <>
          <path d="M14.5 9.6a3.6 3.6 0 0 1 0 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M17 7.4a6.6 6.6 0 0 1 0 9.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
      {level === 0 && (
        <path d="M15 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * Control de volumen: un icono y una barra, sin menús. Es un
 * `<input type="range">` nativo (arrastrar, tocar cualquier punto de la
 * barra y teclado funcionan solos, en escritorio y en móvil), con un área
 * táctil de 44px de alto aunque la barra se vea fina.
 */
export function VolumeControl() {
  const { volume, setVolume } = useAudioApi();

  return (
    <div className={styles.volume}>
      <VolumeIcon level={volume} />
      <input
        type="range"
        className={styles.volumeSlider}
        min={0}
        max={100}
        step={1}
        value={Math.round(volume * 100)}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        style={{ '--fill': `${Math.round(volume * 100)}%` } as React.CSSProperties}
        aria-label="Volumen de la música"
      />
    </div>
  );
}
