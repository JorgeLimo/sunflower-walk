import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { colors } from '../../lib/colors';
import { damp, clamp, createSeededRandom, randomBetween } from '../../lib/random';
import { CAT_SIDE_OFFSET, VELOCITY_FOR_FULL_WALK } from '../../lib/constants';

// Paso más corto y ligero que el trote del Pug, y de paso evita que ambos
// animales se muevan sincronizados. Ritmo natural, igual que WALK_FREQ en
// Person.tsx (ver su comentario): el avance real más rápido sale de
// `VELOCITY_FOR_FULL_WALK`, no de acelerar esta animación.
const STEP_FREQ = 7.2;
const LEG_SWING = 0.46;

/** Eslabones de la cola. Es el rasgo que más define la silueta de un gato
 * visto desde atrás, así que va articulada (cada eslabón cuelga del
 * anterior) para poder curvarla y recorrerla con una onda. */
const TAIL_SEGMENTS = 5;

type Behavior = 'walking' | 'watchingFlowers' | 'sniffing' | 'trotting';

// Semilla propia (el Pug usa 777): si compartieran generador, sus
// comportamientos "autónomos" caerían siempre en el mismo orden.
const random = createSeededRandom(4519);

/**
 * Gato negro doméstico, tercer acompañante del paseo. Construido con el
 * mismo vocabulario que `Person` y `Pug` (cápsulas y esferas, materiales
 * mate, sin texturas) para que no se lea como un elemento de otro estilo.
 *
 * La cámara va justo detrás de los personajes y solo ~20° por encima, así
 * que TODO el diseño está pensado para leerse de espaldas: cuerpo alargado
 * y bajo, cuatro patas finas bien separadas del vientre, orejas
 * triangulares altas y, sobre todo, una cola larga y erguida —es lo único
 * que sobresale del contorno del cuerpo desde esta vista y lo que hace que
 * se reconozca como gato de un vistazo.
 *
 * Igual que los otros dos personajes, el ciclo de patas solo avanza cuando
 * hay velocidad de scroll real: al detenerse el paso se congela, pero la
 * cola, las orejas, el parpadeo y el mirar hacia los girasoles siguen
 * activos, porque son gestos de "estar vivo" y no de "estar caminando".
 */
export function Cat() {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRefs = useRef<(THREE.Group | null)[]>([]);
  const earLeftRef = useRef<THREE.Group>(null);
  const earRightRef = useRef<THREE.Group>(null);
  const legFLRef = useRef<THREE.Group>(null);
  const legFRRef = useRef<THREE.Group>(null);
  const legBLRef = useRef<THREE.Group>(null);
  const legBRRef = useRef<THREE.Group>(null);
  const eyeLeftRef = useRef<THREE.Mesh>(null);
  const eyeRightRef = useRef<THREE.Mesh>(null);

  const scrollState = useScrollState();
  const gaitPhase = useRef(0);
  const walkIntensity = useRef(0);

  const behavior = useRef<Behavior>('walking');
  const behaviorTimeLeft = useRef(randomBetween(random, 3, 7));
  const lagOffset = useRef(0);
  const sideWander = useRef(0);
  const headYaw = useRef(0);
  const headPitch = useRef(0);
  const blinkTimer = useRef(randomBetween(random, 1.5, 4));
  const earTwitch = useRef(randomBetween(random, 2, 5));

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    const targetIntensity = clamp(Math.abs(scrollState.current.velocity) / VELOCITY_FOR_FULL_WALK, 0, 1);
    walkIntensity.current = damp(walkIntensity.current, targetIntensity, 5, delta);
    const intensity = walkIntensity.current;

    // --- Comportamiento autónomo (siempre activo, haya scroll o no) ---
    behaviorTimeLeft.current -= delta;
    if (behaviorTimeLeft.current <= 0) {
      if (behavior.current === 'walking') {
        const roll = random();
        if (roll < 0.4) {
          behavior.current = 'watchingFlowers';
          behaviorTimeLeft.current = randomBetween(random, 1.4, 2.6);
        } else if (roll < 0.62) {
          behavior.current = 'sniffing';
          behaviorTimeLeft.current = randomBetween(random, 1, 1.8);
        } else {
          behaviorTimeLeft.current = randomBetween(random, 4, 8);
        }
      } else if (behavior.current === 'trotting') {
        behavior.current = 'walking';
        behaviorTimeLeft.current = randomBetween(random, 4, 8);
      } else {
        // Tras entretenerse se ha quedado atrás: acelera para reengancharse.
        behavior.current = 'trotting';
        behaviorTimeLeft.current = randomBetween(random, 1.2, 2.2);
      }
    }

    const isPaused = behavior.current === 'watchingFlowers' || behavior.current === 'sniffing';
    const behaviorSpeedFactor = behavior.current === 'trotting' ? 1.7 : isPaused ? 0.12 : 1;

    lagOffset.current += (isPaused ? 0.55 : behavior.current === 'trotting' ? -1.3 : 0) * delta * intensity;
    lagOffset.current = THREE.MathUtils.clamp(lagOffset.current, 0, 1.5);

    const targetWander = behavior.current === 'watchingFlowers' ? 0.26 : 0;
    sideWander.current = damp(sideWander.current, targetWander, 3.5, delta);

    const targetYaw = behavior.current === 'watchingFlowers' ? -0.85 : 0;
    const targetPitch = behavior.current === 'sniffing' ? 0.5 : behavior.current === 'watchingFlowers' ? -0.16 : 0;
    headYaw.current = damp(headYaw.current, targetYaw, 4.5, delta);
    headPitch.current = damp(headPitch.current, targetPitch, 4.5, delta);

    // --- Paso: la fase solo avanza con velocidad real ---
    const speedFactor = behaviorSpeedFactor * intensity;
    gaitPhase.current += delta * STEP_FREQ * speedFactor;
    const gait = gaitPhase.current;

    if (rootRef.current) {
      rootRef.current.position.z = CHARACTER_Z + 0.4 + lagOffset.current;
      rootRef.current.position.x = damp(rootRef.current.position.x, CAT_SIDE_OFFSET + sideWander.current, 3, delta);
      rootRef.current.position.y = 0.2 + Math.abs(Math.sin(gait)) * 0.016 * speedFactor;
    }

    if (bodyRef.current) {
      bodyRef.current.rotation.z = Math.sin(gait) * 0.045 * speedFactor;
    }

    // --- Patas en pares diagonales ---
    if (legFLRef.current) legFLRef.current.rotation.x = Math.sin(gait) * LEG_SWING * speedFactor;
    if (legBRRef.current) legBRRef.current.rotation.x = Math.sin(gait) * LEG_SWING * speedFactor;
    if (legFRRef.current) legFRRef.current.rotation.x = Math.sin(gait + Math.PI) * LEG_SWING * speedFactor;
    if (legBLRef.current) legBLRef.current.rotation.x = Math.sin(gait + Math.PI) * LEG_SWING * speedFactor;

    // --- Cola: erguida, con una onda lenta que la recorre de base a punta ---
    // OJO con los ejes: cada eslabón crece a lo largo de su -Z local, y un
    // vector sobre Z es invariante a `rotation.z` — el vaivén lateral tiene
    // que ir en `rotation.y`.
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const seg = tailRefs.current[i];
      if (!seg) continue;
      const lag = i * 0.55;
      // El primer eslabón la levanta desde la grupa; los siguientes apenas
      // corrigen, de modo que sube casi vertical con una leve curva.
      const basePitch = i === 0 ? 1.12 : -0.04;
      const baseYaw = i === 0 ? 0.26 : 0.03;
      seg.rotation.x = basePitch + Math.sin(t * 1.1 - lag) * 0.05 * (i === 0 ? 0.5 : 1);
      seg.rotation.y = baseYaw + Math.sin(t * 1.5 - lag) * 0.11 * (i === 0 ? 0.6 : 1);
    }

    // --- Orejas: quietas, con algún tic esporádico ---
    earTwitch.current -= delta;
    let twitch = 0;
    if (earTwitch.current <= 0) {
      const local = -earTwitch.current;
      if (local < 0.25) twitch = Math.sin((local / 0.25) * Math.PI) * 0.3;
      else earTwitch.current = randomBetween(random, 2.5, 6);
    }
    if (earLeftRef.current) earLeftRef.current.rotation.z = 0.2 + twitch;
    if (earRightRef.current) earRightRef.current.rotation.z = -0.2 - twitch * 0.6;

    if (headRef.current) {
      headRef.current.rotation.y = headYaw.current + Math.sin(t * 0.5) * 0.07;
      headRef.current.rotation.x = headPitch.current + Math.sin(gait * 0.5) * 0.025 * intensity;
    }

    // --- Parpadeo ---
    blinkTimer.current -= delta;
    let blink = 0;
    if (blinkTimer.current <= 0) {
      const local = -blinkTimer.current;
      if (local < 0.14) blink = Math.sin((local / 0.14) * Math.PI);
      else blinkTimer.current = randomBetween(random, 2, 5.5);
    }
    const eyeScale = 1 - blink * 0.85;
    if (eyeLeftRef.current) eyeLeftRef.current.scale.y = eyeScale;
    if (eyeRightRef.current) eyeRightRef.current.scale.y = eyeScale;
  });

  // Un emisivo mínimo del propio color: sin él, de noche el gato negro se
  // convierte en un agujero plano y se pierde su silueta.
  const furProps = { color: colors.catFur, emissive: colors.catFur, emissiveIntensity: 0.12, roughness: 0.85 };
  const furDarkProps = { color: colors.catFurShadow, emissive: colors.catFurShadow, emissiveIntensity: 0.1, roughness: 0.85 };

  return (
    <group ref={rootRef} position={[CAT_SIDE_OFFSET, 0.2, CHARACTER_Z + 0.4]} rotation={[0, Math.PI, 0]}>
      <group ref={bodyRef}>
        {/* Tronco alargado y bajo: la proporción felina, lejos de la bola */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.082, 0.24, 4, 10]} />
          <meshStandardMaterial {...furProps} />
        </mesh>
        {/* Grupa algo más alta que los hombros, como en un gato real */}
        <mesh position={[0, 0.022, -0.115]} scale={[1, 0.92, 1]} castShadow>
          <sphereGeometry args={[0.083, 10, 8]} />
          <meshStandardMaterial {...furProps} />
        </mesh>
        {/* Pecho y arranque del cuello */}
        <mesh position={[0, 0.012, 0.13]} scale={[0.95, 0.95, 0.9]} castShadow>
          <sphereGeometry args={[0.078, 10, 8]} />
          <meshStandardMaterial {...furProps} />
        </mesh>
        <mesh position={[0, 0.055, 0.175]} rotation={[0.5, 0, 0]} castShadow>
          <capsuleGeometry args={[0.042, 0.055, 4, 8]} />
          <meshStandardMaterial {...furProps} />
        </mesh>

        <group ref={headRef} position={[0, 0.115, 0.215]}>
          {/* Cabeza en cuña, algo más ancha que alta */}
          <mesh scale={[1.05, 0.95, 1]} castShadow>
            <sphereGeometry args={[0.076, 12, 10]} />
            <meshStandardMaterial {...furProps} />
          </mesh>
          {/* Hocico corto y marcado */}
          <mesh position={[0, -0.026, 0.062]} scale={[1.1, 0.75, 0.8]} castShadow>
            <sphereGeometry args={[0.038, 10, 8]} />
            <meshStandardMaterial {...furDarkProps} />
          </mesh>
          <mesh position={[0, -0.012, 0.094]}>
            <sphereGeometry args={[0.012, 8, 6]} />
            <meshStandardMaterial color={colors.catNose} roughness={0.6} />
          </mesh>
          {/* Ojos claros: el contraste que da vida a una cara negra */}
          <mesh ref={eyeLeftRef} position={[0.04, 0.018, 0.058]}>
            <sphereGeometry args={[0.016, 8, 8]} />
            <meshStandardMaterial color={colors.catEye} emissive={colors.catEye} emissiveIntensity={0.45} roughness={0.3} />
          </mesh>
          <mesh ref={eyeRightRef} position={[-0.04, 0.018, 0.058]}>
            <sphereGeometry args={[0.016, 8, 8]} />
            <meshStandardMaterial color={colors.catEye} emissive={colors.catEye} emissiveIntensity={0.45} roughness={0.3} />
          </mesh>
          {/* Orejas triangulares, altas y puntiagudas: con 4 lados el cono
              se lee como triángulo limpio desde cualquier ángulo. */}
          <group ref={earLeftRef} position={[0.042, 0.062, -0.004]}>
            <mesh position={[0, 0.045, 0]} rotation={[-0.12, 0, 0]} castShadow>
              <coneGeometry args={[0.036, 0.095, 4]} />
              <meshStandardMaterial {...furProps} />
            </mesh>
            <mesh position={[0, 0.042, 0.012]} rotation={[-0.12, 0, 0]} scale={[0.5, 0.8, 0.3]}>
              <coneGeometry args={[0.036, 0.095, 4]} />
              <meshStandardMaterial color={colors.catNose} roughness={0.9} />
            </mesh>
          </group>
          <group ref={earRightRef} position={[-0.042, 0.062, -0.004]}>
            <mesh position={[0, 0.045, 0]} rotation={[-0.12, 0, 0]} castShadow>
              <coneGeometry args={[0.036, 0.095, 4]} />
              <meshStandardMaterial {...furProps} />
            </mesh>
            <mesh position={[0, 0.042, 0.012]} rotation={[-0.12, 0, 0]} scale={[0.5, 0.8, 0.3]}>
              <coneGeometry args={[0.036, 0.095, 4]} />
              <meshStandardMaterial color={colors.catNose} roughness={0.9} />
            </mesh>
          </group>
        </group>

        {/* Cola larga y articulada, tan larga como el cuerpo. Sale de la
            grupa (no del centro del lomo) y sube casi vertical, que es lo
            que la recorta contra el fondo con la cámara detrás. */}
        <group ref={(el) => { tailRefs.current[0] = el; }} position={[0, 0.045, -0.185]}>
          <mesh position={[0, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <capsuleGeometry args={[0.024, 0.05, 4, 6]} />
            <meshStandardMaterial {...furProps} />
          </mesh>
          <group ref={(el) => { tailRefs.current[1] = el; }} position={[0, 0, -0.082]}>
            <mesh position={[0, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.022, 0.05, 4, 6]} />
              <meshStandardMaterial {...furProps} />
            </mesh>
            <group ref={(el) => { tailRefs.current[2] = el; }} position={[0, 0, -0.082]}>
              <mesh position={[0, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <capsuleGeometry args={[0.02, 0.05, 4, 6]} />
                <meshStandardMaterial {...furProps} />
              </mesh>
              <group ref={(el) => { tailRefs.current[3] = el; }} position={[0, 0, -0.082]}>
                <mesh position={[0, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <capsuleGeometry args={[0.018, 0.05, 4, 6]} />
                  <meshStandardMaterial {...furProps} />
                </mesh>
                <group ref={(el) => { tailRefs.current[4] = el; }} position={[0, 0, -0.08]}>
                  <mesh position={[0, 0, -0.038]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <capsuleGeometry args={[0.016, 0.048, 4, 6]} />
                    <meshStandardMaterial {...furProps} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* Cuatro patas finas y bien despegadas del vientre */}
        <group ref={legFLRef} position={[0.052, -0.06, 0.1]}>
          <mesh position={[0, -0.062, 0]} castShadow>
            <capsuleGeometry args={[0.021, 0.085, 4, 6]} />
            <meshStandardMaterial {...furProps} />
          </mesh>
        </group>
        <group ref={legFRRef} position={[-0.052, -0.06, 0.1]}>
          <mesh position={[0, -0.062, 0]} castShadow>
            <capsuleGeometry args={[0.021, 0.085, 4, 6]} />
            <meshStandardMaterial {...furProps} />
          </mesh>
        </group>
        <group ref={legBLRef} position={[0.054, -0.06, -0.1]}>
          <mesh position={[0, -0.062, 0]} castShadow>
            <capsuleGeometry args={[0.022, 0.085, 4, 6]} />
            <meshStandardMaterial {...furDarkProps} />
          </mesh>
        </group>
        <group ref={legBRRef} position={[-0.054, -0.06, -0.1]}>
          <mesh position={[0, -0.062, 0]} castShadow>
            <capsuleGeometry args={[0.022, 0.085, 4, 6]} />
            <meshStandardMaterial {...furDarkProps} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
