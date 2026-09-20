import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useScrollState } from '../story/scrollContext';
import { experience } from '../../lib/experienceStore';
import styles from './SongBubble.module.scss';

// Segundos quieto, ya dentro, antes de que la protagonista dé la pista.
const IDLE_BEFORE_HINT_S = 6;
const VISIBLE_MAX_S = 14;
const EXIT_MS = 300;

/**
 * Pista de la protagonista: si el usuario entra y se queda sin hacer scroll,
 * ella dice "Haz scroll para moverme 😊". Sale una sola vez: desaparece en
 * cuanto hay scroll (o tras unos segundos) y no vuelve. Es solo texto, no
 * captura toques, así que nunca estorba el scroll.
 */
export function HelpBubble({ position }: { position: [number, number, number] }) {
  const scrollState = useScrollState();
  const [phase, setPhase] = useState<'idle' | 'shown' | 'leaving' | 'done'>('idle');
  const startedAt = useRef<number | null>(null);
  const shownAt = useRef(0);
  const leavingRef = useRef(false);

  useFrame((state) => {
    if (phase === 'done' || !experience.started) return;
    const t = state.clock.elapsedTime;
    if (startedAt.current === null) startedAt.current = t;
    const scrolled = scrollState.current.rawDistance > 0.001 || Math.abs(scrollState.current.velocity) > 0.05;

    if (phase === 'idle') {
      if (scrolled) setPhase('done');
      else if (t - startedAt.current > IDLE_BEFORE_HINT_S) {
        shownAt.current = t;
        setPhase('shown');
      }
    } else if (phase === 'shown' && !leavingRef.current && (scrolled || t - shownAt.current > VISIBLE_MAX_S)) {
      leavingRef.current = true;
      setPhase('leaving');
      setTimeout(() => setPhase('done'), EXIT_MS);
    }
  });

  if (phase === 'idle' || phase === 'done') return null;

  return (
    <group position={position}>
      <Html zIndexRange={[30, 0]}>
        <div className={styles.place} data-side="center">
          <div className={styles.bubble} data-static="true" data-leaving={phase === 'leaving'} role="status">
            Haz scroll para moverme 😊
          </div>
        </div>
      </Html>
    </group>
  );
}
