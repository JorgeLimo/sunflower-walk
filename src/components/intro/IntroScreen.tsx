import { motion } from 'framer-motion';
import { useAudioApi } from '../audio/AudioContext';
import styles from './IntroScreen.module.scss';

// Motas de polvo de luz que suben muy despacio: posición/tamaño/tiempos fijos
// (no aleatorios por render) para que el fondo sea estable.
const MOTES = [
  { left: 12, size: 3, duration: 26, delay: -4 },
  { left: 24, size: 2, duration: 32, delay: -18 },
  { left: 37, size: 4, duration: 30, delay: -10 },
  { left: 52, size: 2, duration: 36, delay: -26 },
  { left: 63, size: 3, duration: 28, delay: -14 },
  { left: 76, size: 2, duration: 34, delay: -6 },
  { left: 88, size: 4, duration: 31, delay: -22 },
  { left: 46, size: 2, duration: 38, delay: -30 },
];

interface IntroScreenProps {
  onEnter: () => void;
}

/**
 * Puerta de entrada mínima. El click en "Entrar" ocurre en el mismo
 * gesto del usuario que dispara `audio.play()`, que es lo que exigen los
 * navegadores para permitir reproducir sonido.
 */
export function IntroScreen({ onEnter }: IntroScreenProps) {
  const { audioRef } = useAudioApi();

  const handleEnter = () => {
    audioRef.current?.play().catch(() => {
      // Si el navegador igual bloquea la reproducción, la experiencia
      // continúa en silencio; el botón de música permite reintentar.
    });
    onEnter();
  };

  return (
    <motion.div
      className={styles.gate}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: [0.45, 0, 0.55, 1] }}
    >
      {/* Fondo puramente abstracto (luz, anillos, polvo): nada que anticipe lo
          que hay después de "Entrar". */}
      <div className={styles.glow} aria-hidden="true" />
      <svg className={styles.rings} viewBox="0 0 600 600" aria-hidden="true">
        <g className={styles.ringSlow} fill="none" stroke="currentColor" strokeWidth="0.8">
          <circle cx="300" cy="300" r="290" strokeDasharray="1 7" opacity="0.5" />
          <circle cx="300" cy="300" r="222" opacity="0.4" />
        </g>
        <g className={styles.ringReverse} fill="none" stroke="currentColor" strokeWidth="0.8">
          <circle cx="300" cy="300" r="150" strokeDasharray="60 12 4 12" opacity="0.45" />
        </g>
        <g className={styles.orbit}>
          <circle cx="300" cy="78" r="2.6" fill="#ffb15e" />
          <circle cx="300" cy="78" r="7" fill="#ffb15e" opacity="0.18" />
        </g>
      </svg>
      <div className={styles.motes} aria-hidden="true">
        {MOTES.map((m, i) => (
          <span
            key={i}
            style={{ left: `${m.left}%`, width: m.size, height: m.size, animationDuration: `${m.duration}s`, animationDelay: `${m.delay}s` }}
          />
        ))}
      </div>
      <div className={styles.corner} data-pos="tl" aria-hidden="true" />
      <div className={styles.corner} data-pos="tr" aria-hidden="true" />
      <div className={styles.corner} data-pos="bl" aria-hidden="true" />
      <div className={styles.corner} data-pos="br" aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.content}>
        <p className={styles.hint}>Haz clic en «Entrar» y luego haz scroll.</p>
        <button type="button" className={styles.enterButton} onClick={handleEnter}>
          Entrar
        </button>
        <div className={styles.swipe} aria-hidden="true">
          <svg className={styles.swipeIcon} viewBox="0 0 44 64" width="42" height="62">
            <g className={styles.chevrons} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 8l7-6 7 6" />
              <path d="M15 15l7-6 7 6" opacity="0.5" />
            </g>
            <g className={styles.hand} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 42V25a4 4 0 0 1 8 0v10a3.5 3.5 0 0 1 7 0a3.5 3.5 0 0 1 7 0v9c0 8-5 13-13 13h-3c-5 0-8-3-10-7l-4-7c-1-2 1-4 3-3l5 4z" />
            </g>
          </svg>
          <span className={styles.swipeLabel}>Scroll</span>
        </div>
      </div>
    </motion.div>
  );
}
