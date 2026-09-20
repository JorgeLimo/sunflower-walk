import { useEffect, useSyncExternalStore } from 'react';
import { orientationStore } from '../../lib/orientationStore';
import styles from './OrientationGuard.module.scss';

// Teléfono (puntero táctil) en horizontal: es de baja altura, así que una
// tablet o una ventana de escritorio angosta nunca lo dispara.
const LANDSCAPE_PHONE = '(orientation: landscape) and (pointer: coarse) and (max-height: 520px)';

/**
 * La experiencia solo funciona en vertical. En horizontal muestra un aviso
 * (opaco, encima de todo) para girar el dispositivo; al volver a vertical
 * desaparece y todo sigue donde estaba: el aviso no desmonta nada — la
 * escena, la música y el scroll quedan intactos debajo.
 */
export function OrientationGuard() {
  const locked = useSyncExternalStore(orientationStore.subscribe, orientationStore.isLocked);

  useEffect(() => {
    const mq = window.matchMedia(LANDSCAPE_PHONE);
    const sync = () => orientationStore.set(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  if (!locked) return null;

  return (
    <div
      className={styles.overlay}
      role="alert"
      // Sin esto, deslizar sobre el aviso seguiría moviendo la página de atrás.
      onTouchMove={(e) => e.preventDefault()}
    >
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.content}>
        <svg className={styles.phone} viewBox="0 0 64 96" width="56" height="84" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="12" y="6" width="40" height="84" rx="8" />
            <path d="M27 14h10" />
            <circle cx="32" cy="79" r="2.4" />
          </g>
        </svg>
        <svg className={styles.arrow} viewBox="0 0 48 24" width="44" height="22" aria-hidden="true">
          <path d="M6 18c6-12 26-14 36-4M42 14l-8-1M42 14l-1 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className={styles.text}>Gira tu dispositivo para continuar</p>
      </div>
    </div>
  );
}
