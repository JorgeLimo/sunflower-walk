import { motion } from 'framer-motion';
import { useAudioApi } from '../audio/AudioContext';
import styles from './IntroScreen.module.scss';

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
      <div className={styles.heading}>
        <p className={styles.title}>Haz clic en «Entrar»</p>
        <p className={styles.title}>Y luego haz scroll.</p>
      </div>
      <button type="button" className={styles.enterButton} onClick={handleEnter}>
        Entrar
      </button>
    </motion.div>
  );
}
