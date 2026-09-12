import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { colors } from '../../lib/colors';
import { damp, clamp, createSeededRandom, randomBetween } from '../../lib/random';
import { PUG_SIDE_OFFSET, VELOCITY_FOR_FULL_WALK } from '../../lib/constants';

const TROT_FREQ = 6.4;
const LEG_SWING = 0.5;

type Behavior = 'walking' | 'sniffing' | 'lookingAside' | 'catchingUp';

const random = createSeededRandom(777);

/**
 * Perro Pug procedural. Igual que en `Person`, el trote de las patas solo
 * avanza cuando hay velocidad de scroll real — se congela suavemente al
 * detenerse. La cola, las orejas, el parpadeo y el comportamiento autónomo
 * (olfatear, mirar a un lado, adelantarse y volver) siguen activos siempre,
 * incluso con el mundo detenido, porque son gestos de "estar vivo" y no de
 * "estar caminando".
 *
 * Preparado para reemplazo futuro por un modelo GLB/GLTF con animaciones
 * reales: el `rootRef` es el único punto de contacto con la posición en
 * el mundo.
 */
export function Pug() {
  const rootRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
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
  const behaviorTimeLeft = useRef(randomBetween(random, 4, 8));
  const lagOffset = useRef(0);
  const sideWander = useRef(0);
  const headYaw = useRef(0);
  const headPitch = useRef(0);
  const blinkTimer = useRef(randomBetween(random, 2, 5));

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    const targetIntensity = clamp(Math.abs(scrollState.current.velocity) / VELOCITY_FOR_FULL_WALK, 0, 1);
    walkIntensity.current = damp(walkIntensity.current, targetIntensity, 5, delta);
    const intensity = walkIntensity.current;

    // --- Máquina de estados de comportamiento autónomo (siempre activa) ---
    behaviorTimeLeft.current -= delta;
    if (behaviorTimeLeft.current <= 0) {
      if (behavior.current === 'walking') {
        const roll = random();
        if (roll < 0.35) {
          behavior.current = 'sniffing';
          behaviorTimeLeft.current = randomBetween(random, 1.2, 2.2);
        } else if (roll < 0.6) {
          behavior.current = 'lookingAside';
          behaviorTimeLeft.current = randomBetween(random, 1, 1.8);
        } else {
          behaviorTimeLeft.current = randomBetween(random, 5, 9);
        }
      } else if (behavior.current === 'catchingUp') {
        behavior.current = 'walking';
        behaviorTimeLeft.current = randomBetween(random, 5, 9);
      } else {
        behavior.current = 'catchingUp';
        behaviorTimeLeft.current = randomBetween(random, 1, 1.8);
      }
    }

    const isPaused = behavior.current === 'sniffing' || behavior.current === 'lookingAside';
    const behaviorSpeedFactor = behavior.current === 'catchingUp' ? 1.8 : isPaused ? 0.15 : 1;

    // El rezago solo se acumula/recupera mientras el mundo se mueve.
    lagOffset.current += (isPaused ? 0.6 : behavior.current === 'catchingUp' ? -1.4 : 0) * delta * intensity;
    lagOffset.current = THREE.MathUtils.clamp(lagOffset.current, 0, 1.6);

    const targetWander = behavior.current === 'lookingAside' ? 0.35 : 0;
    sideWander.current = damp(sideWander.current, targetWander, 4, delta);

    const targetYaw = behavior.current === 'lookingAside' ? 0.7 : 0;
    const targetPitch = behavior.current === 'sniffing' ? 0.5 : 0;
    headYaw.current = damp(headYaw.current, targetYaw, 5, delta);
    headPitch.current = damp(headPitch.current, targetPitch, 5, delta);

    // --- Trote: la fase solo avanza con velocidad real ---
    const speedFactor = behaviorSpeedFactor * intensity;
    gaitPhase.current += delta * TROT_FREQ * speedFactor;
    const gait = gaitPhase.current;

    // --- Posición en el mundo (sigue a la persona con leve rezago) ---
    if (rootRef.current) {
      const targetZ = CHARACTER_Z + 0.4 + lagOffset.current;
      rootRef.current.position.z = targetZ;
      rootRef.current.position.x = damp(
        rootRef.current.position.x,
        PUG_SIDE_OFFSET + sideWander.current,
        3,
        delta,
      );
      rootRef.current.position.y = 0.24 + Math.abs(Math.sin(gait)) * 0.03 * speedFactor;
    }

    // --- Patas (pares diagonales), amplitud atada a la intensidad ---
    if (legFLRef.current) legFLRef.current.rotation.x = Math.sin(gait) * LEG_SWING * speedFactor;
    if (legBRRef.current) legBRRef.current.rotation.x = Math.sin(gait) * LEG_SWING * speedFactor;
    if (legFRRef.current) legFRRef.current.rotation.x = Math.sin(gait + Math.PI) * LEG_SWING * speedFactor;
    if (legBLRef.current) legBLRef.current.rotation.x = Math.sin(gait + Math.PI) * LEG_SWING * speedFactor;

    // --- Cola: siempre en movimiento, incluso quieto ---
    if (tailRef.current) {
      const wagSpeed = behavior.current === 'catchingUp' ? 12 : 7 + intensity * 2;
      const wagAmount = 0.35 + intensity * 0.25;
      tailRef.current.rotation.y = Math.sin(t * wagSpeed) * wagAmount + Math.sin(t * wagSpeed * 0.37) * 0.08;
    }

    // --- Orejas: temblor sutil permanente ---
    if (earLeftRef.current) earLeftRef.current.rotation.z = 0.15 + Math.sin(t * 5) * 0.05;
    if (earRightRef.current) earRightRef.current.rotation.z = -0.15 - Math.sin(t * 5 + 0.6) * 0.05;

    // --- Cabeza: bob natural + comportamiento autónomo, siempre activa ---
    if (headRef.current) {
      headRef.current.rotation.y = headYaw.current + Math.sin(t * 0.6) * 0.05;
      headRef.current.rotation.x = headPitch.current + Math.sin(gait * 0.5) * 0.03 * intensity;
    }

    // --- Parpadeo ---
    blinkTimer.current -= delta;
    let blink = 0;
    if (blinkTimer.current <= 0) {
      const blinkT = -blinkTimer.current;
      if (blinkT < 0.12) {
        blink = Math.sin((blinkT / 0.12) * Math.PI);
      } else {
        blinkTimer.current = randomBetween(random, 2.5, 6);
      }
    }
    const eyeScale = 1 - blink * 0.85;
    if (eyeLeftRef.current) eyeLeftRef.current.scale.y = eyeScale;
    if (eyeRightRef.current) eyeRightRef.current.scale.y = eyeScale;
  });

  return (
    <group ref={rootRef} position={[PUG_SIDE_OFFSET, 0.24, 0]} rotation={[0, Math.PI, 0]}>
      {/* Cuerpo */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.34, 4, 8]} />
        <meshStandardMaterial color={colors.pugBody} roughness={0.9} />
      </mesh>

      {/* Cabeza */}
      <group ref={headRef} position={[0, 0.06, 0.26]}>
        <mesh castShadow>
          <sphereGeometry args={[0.155, 16, 16]} />
          <meshStandardMaterial color={colors.pugBody} roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.03, 0.12]} castShadow>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshStandardMaterial color={colors.pugDark} roughness={0.7} />
        </mesh>
        <mesh ref={eyeLeftRef} position={[0.075, 0.02, 0.1]}>
          <sphereGeometry args={[0.024, 8, 8]} />
          <meshStandardMaterial color={colors.pugDark} roughness={0.5} />
        </mesh>
        <mesh ref={eyeRightRef} position={[-0.075, 0.02, 0.1]}>
          <sphereGeometry args={[0.024, 8, 8]} />
          <meshStandardMaterial color={colors.pugDark} roughness={0.5} />
        </mesh>
        <group ref={earLeftRef} position={[0.11, 0.13, -0.02]}>
          <mesh position={[0, -0.05, 0]} castShadow>
            <coneGeometry args={[0.05, 0.12, 8]} />
            <meshStandardMaterial color={colors.pugDark} roughness={0.9} />
          </mesh>
        </group>
        <group ref={earRightRef} position={[-0.11, 0.13, -0.02]}>
          <mesh position={[0, -0.05, 0]} castShadow>
            <coneGeometry args={[0.05, 0.12, 8]} />
            <meshStandardMaterial color={colors.pugDark} roughness={0.9} />
          </mesh>
        </group>
      </group>

      {/* Cola */}
      <group ref={tailRef} position={[0, 0.14, -0.22]}>
        <mesh position={[0, 0.05, -0.06]} rotation={[0.9, 0, 0]} castShadow>
          <capsuleGeometry args={[0.035, 0.16, 4, 6]} />
          <meshStandardMaterial color={colors.pugBodyShadow} roughness={0.9} />
        </mesh>
      </group>

      {/* Patas */}
      <group ref={legFLRef} position={[0.1, -0.1, 0.16]}>
        <mesh position={[0, -0.09, 0]} castShadow>
          <capsuleGeometry args={[0.035, 0.16, 4, 6]} />
          <meshStandardMaterial color={colors.pugBody} roughness={0.9} />
        </mesh>
      </group>
      <group ref={legFRRef} position={[-0.1, -0.1, 0.16]}>
        <mesh position={[0, -0.09, 0]} castShadow>
          <capsuleGeometry args={[0.035, 0.16, 4, 6]} />
          <meshStandardMaterial color={colors.pugBody} roughness={0.9} />
        </mesh>
      </group>
      <group ref={legBLRef} position={[0.1, -0.1, -0.16]}>
        <mesh position={[0, -0.09, 0]} castShadow>
          <capsuleGeometry args={[0.035, 0.16, 4, 6]} />
          <meshStandardMaterial color={colors.pugBodyShadow} roughness={0.9} />
        </mesh>
      </group>
      <group ref={legBRRef} position={[-0.1, -0.1, -0.16]}>
        <mesh position={[0, -0.09, 0]} castShadow>
          <capsuleGeometry args={[0.035, 0.16, 4, 6]} />
          <meshStandardMaterial color={colors.pugBodyShadow} roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}
