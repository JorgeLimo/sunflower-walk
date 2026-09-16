import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud, Clouds as DreiClouds } from '@react-three/drei';
import * as THREE from 'three';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { CHARACTER_Z } from '../../lib/walk';
import { useScrollState } from '../story/scrollContext';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';

interface CloudSpec {
  id: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  speed: number;
}

// Ancho del carril de deriva horizontal. Se ensanchó a propósito (antes
// 150) para que cada nube quede más separada de sus vecinas — con menos
// nubes y más espacio entre ellas, se leen como grupos independientes con
// cielo despejado entre medio, en vez de una masa continua.
const DRIFT_SPAN = 190;

function generateClouds(count: number): CloudSpec[] {
  const random = createSeededRandom(99);
  const specs: CloudSpec[] = [];
  // Reparto estratificado: un slot igual de ancho por nube dentro del
  // carril, con jitter dentro del slot — así siempre hay cobertura pareja
  // en vez de que el azar puro las apelotone todas de un lado.
  const slot = DRIFT_SPAN / count;
  for (let i = 0; i < count; i++) {
    const slotCenter = -DRIFT_SPAN / 2 + slot * (i + 0.5);
    // Siempre bien adelante del personaje (Z negativo relativo a
    // CHARACTER_Z), nunca detrás — así jamás terminan entre la cámara y la
    // persona/el Pug.
    const z = randomBetween(random, -95, -25);
    // La altura DEBE crecer con la distancia (no un rango fijo aparte):
    // una nube cercana puesta demasiado alta queda fuera del campo visual
    // de la cámara (que mira casi al frente, con una inclinación leve),
    // igual que le pasaba antes al sol/la luna/las estrellas fugaces.
    const height = 2.2 + (Math.abs(z) + 6.4) * 0.3 + randomBetween(random, -2.5, 2.5);
    specs.push({
      id: i,
      x: slotCenter + randomBetween(random, -slot * 0.35, slot * 0.35),
      y: height,
      z,
      // Más chicas que antes (antes 1.1-2.2): grupos discretos, ninguno
      // debe leerse como si ocupara medio cielo.
      scale: randomBetween(random, 0.85, 1.6),
      opacity: randomBetween(random, 0.58, 0.8),
      // Unidades de mundo por segundo, cada una con su propio ritmo (lenta/
      // media/rápida) para que nunca se sientan sincronizadas.
      speed: randomBetween(random, 0.15, 0.45),
    });
  }
  return specs;
}

function DriftingCloud({ spec, color, opacityMultiplier }: { spec: CloudSpec; color: string; opacityMultiplier: number }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const raw = spec.x + state.clock.elapsedTime * spec.speed + DRIFT_SPAN / 2;
    const wrapped = ((raw % DRIFT_SPAN) + DRIFT_SPAN) % DRIFT_SPAN;
    group.current.position.x = wrapped - DRIFT_SPAN / 2;
    // Un vaivén vertical apenas perceptible, para que no se sientan
    // clavadas en su altura mientras derivan.
    group.current.position.y = spec.y + Math.sin(state.clock.elapsedTime * 0.06 + spec.id * 1.7) * 0.5;
  });

  return (
    <group ref={group} position={[spec.x, spec.y, spec.z]}>
      <Cloud
        seed={spec.id}
        scale={spec.scale}
        opacity={spec.opacity * opacityMultiplier}
        speed={0.05}
        segments={18}
        bounds={[2.4, 0.85, 1.5]}
        volume={5.5}
        color={color}
        fade={45}
      />
    </group>
  );
}

interface CloudsProps {
  count: number;
}

/**
 * Nubes ancladas cerca de la persona (que permanece fija en CHARACTER_Z —
 * ver lib/walk.ts): varios grupos independientes y separados (reparto
 * estratificado en un carril ancho), con una deriva horizontal lenta y
 * continua. Su tinte por hora del día es deliberadamente sutil (mezcla muy
 * baja con `fogColor`) para que sigan leyéndose blancas/gris muy claro en
 * vez de plomizas, incluso durante el día cálido.
 *
 * Son exclusivamente diurnas: se reutiliza el mismo `nightFactor` del ciclo
 * día/noche existente (el que ya usan aves y cometas) para desvanecer su
 * opacidad a 0 hacia la noche y devolverla al llegar el amanecer — sin
 * crear un segundo sistema de tiempo ni un corte brusco tipo display:none.
 *
 * Importante: `<Clouds material={THREE.MeshBasicMaterial}>` reemplaza el
 * `MeshLambertMaterial` que usa drei por defecto — ese material SÍ
 * reacciona a la luz direccional del sol, así que cada "mota" de la nube
 * mostraba un lado sombreado gris según el ángulo del sol. Con un material
 * no-iluminado, las nubes muestran siempre su color propio (blanco/gris
 * muy claro), sin ese sombreado.
 */
export function Clouds({ count }: CloudsProps) {
  const specs = useMemo(() => generateClouds(count), [count]);
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;
  const [tint, setTint] = useState('#ffffff');
  const [dayVisibility, setDayVisibility] = useState(1);
  const acc = useRef(0);
  const lastVisibility = useRef(1);
  const tintColor = useRef(new THREE.Color());

  useFrame((_, delta) => {
    const distance = scrollState.current.smoothDistance;
    getSkyState(getCycleProgress(distance), skyState);

    // El refresco va limitado a ~0.35 s para no re-renderizar de más, pero
    // con scroll rápido el ciclo entero puede avanzar dentro de ese margen y
    // las nubes se quedaban visibles en un cielo que ya era de noche. Si el
    // objetivo se despega, se actualiza de inmediato.
    const targetVisibility = 1 - skyState.nightFactor;
    acc.current += delta;
    if (acc.current > 0.35 || Math.abs(targetVisibility - lastVisibility.current) > 0.07) {
      acc.current = 0;
      lastVisibility.current = targetVisibility;
      // El material ya no es lit (ver más abajo), así que su brillo no cae
      // solo de noche por sí mismo: hay que oscurecerlo a propósito con
      // `nightFactor`, si no las nubes quedarían blanco-brillante incluso
      // en plena noche.
      const blend = 0.12 + skyState.nightFactor * 0.55;
      tintColor.current.set('#ffffff').lerp(skyState.fogColor, blend);
      tintColor.current.multiplyScalar(1 - skyState.nightFactor * 0.55);
      setTint(`#${tintColor.current.getHexString()}`);
      // Nubes exclusivamente diurnas: opacidad 1 de día, cae suavemente
      // (heredando el mismo suavizado del ciclo) hasta 0 en la meseta
      // nocturna, y vuelve a subir en el amanecer.
      setDayVisibility(targetVisibility);
    }
  });

  // Debajo de este umbral la opacidad ya es imperceptible y se ocultan.
  //
  // Importante: se ocultan con `visible`, NO desmontando el sistema. `Clouds`
  // de drei reparte sus "pompones" sobre un InstancedMesh cuyas matrices se
  // calculan en su propio useFrame, así que en el primer frame tras montarse
  // las instancias siguen sin colocar y aparecen todas en el origen: una
  // mancha blanca enorme a ras de suelo, encima del personaje. Con `visible`
  // el sistema sigue vivo y actualizándose, solo deja de dibujarse.
  const cloudsVisible = dayVisibility > 0.02;

  return (
    <group position={[0, 0, CHARACTER_Z]}>
      <DreiClouds material={THREE.MeshBasicMaterial} limit={count * 20} visible={cloudsVisible}>
        {specs.map((spec) => (
          <DriftingCloud key={spec.id} spec={spec} color={tint} opacityMultiplier={dayVisibility} />
        ))}
      </DreiClouds>
    </group>
  );
}
