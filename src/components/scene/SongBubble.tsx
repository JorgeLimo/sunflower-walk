import { useEffect, useState, useSyncExternalStore } from 'react';
import { Html } from '@react-three/drei';
import { songBubbleStore, type BubbleAnimal } from '../../lib/songBubbleStore';
import styles from './SongBubble.module.scss';

const EXIT_MS = 300;

interface SongBubbleProps {
  animal: BubbleAnimal;
  /** Punto (local al animal) sobre su cabeza al que se ancla el pico. */
  position: [number, number, number];
}

/**
 * Burbuja de conversación del animal: "¿Cambiamos de canción? 🎵". Va como
 * hijo del grupo raíz del Pug/gato, así que sigue todo su movimiento sin
 * tocar sus animaciones. Solo existe (montada) mientras el director la
 * muestra; tocarla/clickearla cambia a la siguiente canción.
 */
export function SongBubble({ animal, position }: SongBubbleProps) {
  const active = useSyncExternalStore(songBubbleStore.subscribe, () => songBubbleStore.getActive() === animal);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (active) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [active]);

  if (!active && !mounted) return null;

  return (
    <group position={position}>
      <Html zIndexRange={[30, 0]}>
        <div className={styles.place} data-side={animal === 'pug' ? 'left' : 'right'}>
          <button
            type="button"
            className={styles.bubble}
            data-leaving={!active}
            onClick={() => songBubbleStore.press()}
            aria-label="Cambiar de canción"
          >
            ¿Cambiamos de canción? 🎵
          </button>
        </div>
      </Html>
    </group>
  );
}
