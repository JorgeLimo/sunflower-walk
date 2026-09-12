import { useEffect, useRef, type ReactNode } from 'react';
import { ScrollStateContext, type ScrollState, type ScrollStateRef } from './scrollContext';
import { SCROLL_TO_WORLD } from '../../lib/constants';
import { clamp } from '../../lib/random';
import styles from './ScrollController.module.scss';

/** Cuántas alturas de pantalla de margen se dejan antes de recentrar el
 * scroll. El track es enorme (ver ScrollController.module.scss) así que
 * esto solo se dispara tras muchísimo scroll continuo en una dirección. */
const RECENTER_MARGIN_VH = 1;

/** Tope al delta de un solo evento de scroll (en píxeles). Sin esto, un
 * scroll rápido o un "fling" de trackpad podría inyectar un salto enorme de
 * una sola vez en `rawDistance` — el suavizado de ScrollPhysics solo
 * demora ESE salto, no lo reduce, así que la escena igual terminaría
 * "disparándose" hacia adelante. Limitar el delta de entrada evita eso en
 * la fuente, sin afectar el scroll a ritmo normal. */
const MAX_SCROLL_DELTA_PX = 140;

/**
 * Traduce el scroll de la página en una distancia de mundo *sin límite*.
 * El truco: el documento tiene un scroll acotado (un track de altura fija),
 * pero cuando el usuario se acerca a cualquiera de los dos extremos, la
 * posición de scroll se recentra silenciosamente — el delta de ese salto
 * se descarta, así que la distancia acumulada nunca "choca" contra nada.
 * Esto es lo que permite que el mundo se sienta infinito en ambas direcciones.
 */
export function ScrollController({ children }: { children: ReactNode }) {
  const stateRef = useRef<ScrollStateRef>({
    current: { rawDistance: 0, smoothDistance: 0, velocity: 0 } satisfies ScrollState,
  }).current;

  const lastScrollY = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const recenterIfNeeded = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const margin = window.innerHeight * RECENTER_MARGIN_VH;
      if (max <= margin * 2) return;
      if (window.scrollY < margin || window.scrollY > max - margin) {
        const target = max / 2;
        lastScrollY.current = target;
        window.scrollTo(0, target);
      }
    };

    const handleScroll = () => {
      const y = window.scrollY;
      const rawDelta = y - lastScrollY.current;
      lastScrollY.current = y;
      const delta = clamp(rawDelta, -MAX_SCROLL_DELTA_PX, MAX_SCROLL_DELTA_PX);
      stateRef.current.rawDistance += delta * SCROLL_TO_WORLD;
      recenterIfNeeded();
    };

    // Arranca centrado para tener recorrido disponible en ambas direcciones.
    const doc = document.documentElement;
    const initialMax = doc.scrollHeight - window.innerHeight;
    if (initialMax > 0) {
      const mid = initialMax / 2;
      window.scrollTo(0, mid);
      lastScrollY.current = mid;
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [stateRef]);

  return (
    <ScrollStateContext.Provider value={stateRef}>
      <div ref={trackRef} className={styles.track}>
        <div className={styles.pinned}>{children}</div>
      </div>
    </ScrollStateContext.Provider>
  );
}
