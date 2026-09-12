import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { colors } from '../../lib/colors';
import { damp, clamp } from '../../lib/random';
import { VELOCITY_FOR_FULL_WALK } from '../../lib/constants';

const WALK_FREQ = 5.2;
const LEG_SWING = 0.55;
const ARM_SWING = 0.5;
const HIP_HEIGHT = 0.62;

/**
 * Personaje procedural de la persona. El ciclo de piernas/brazos NO corre
 * solo — su fase avanza a un ritmo proporcional a `walkIntensity`, que a
 * su vez depende de la velocidad de scroll suavizada. Sin scroll, la fase
 * se congela y la amplitud del paso cae a cero (postura de pie relajada);
 * con scroll, ambas suben juntas, así que caminar más rápido se siente
 * físicamente conectado al desplazamiento, no solo visualmente.
 *
 * La respiración/mirada de la cabeza sí es permanente (independiente del
 * scroll) para que nunca se vea "congelado" al detenerse.
 *
 * Preparado para reemplazo futuro: cuando exista un modelo GLB animado,
 * basta con sustituir el contenido de este <group> por el resultado de
 * `useGLTF` + su AnimationMixer, conservando el mismo `rootRef` y la
 * señal `walkIntensity` para cross-fadear entre clips idle/walk.
 */
export function Person() {
  const rootRef = useRef<THREE.Group>(null);
  const hipsRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const armLeftRef = useRef<THREE.Group>(null);
  const armRightRef = useRef<THREE.Group>(null);
  const legLeftRef = useRef<THREE.Group>(null);
  const legRightRef = useRef<THREE.Group>(null);

  const scrollState = useScrollState();
  const gaitPhase = useRef(0);
  const walkIntensity = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const targetIntensity = clamp(Math.abs(scrollState.current.velocity) / VELOCITY_FOR_FULL_WALK, 0, 1);
    walkIntensity.current = damp(walkIntensity.current, targetIntensity, 5, delta);
    const intensity = walkIntensity.current;

    gaitPhase.current += delta * WALK_FREQ * intensity;
    const phase = gaitPhase.current;

    if (rootRef.current) {
      rootRef.current.rotation.z = Math.sin(phase) * 0.025 * intensity;
    }

    if (hipsRef.current) {
      const walkBob = Math.abs(Math.sin(phase)) * 0.05 * intensity;
      const idleBreath = Math.sin(t * 0.8) * 0.012 * (1 - intensity * 0.5);
      hipsRef.current.position.y = HIP_HEIGHT + walkBob + idleBreath;
    }

    if (legLeftRef.current) legLeftRef.current.rotation.x = Math.sin(phase) * LEG_SWING * intensity;
    if (legRightRef.current) legRightRef.current.rotation.x = Math.sin(phase + Math.PI) * LEG_SWING * intensity;
    if (armLeftRef.current) armLeftRef.current.rotation.x = Math.sin(phase + Math.PI) * ARM_SWING * intensity;
    if (armRightRef.current) armRightRef.current.rotation.x = Math.sin(phase) * ARM_SWING * intensity;

    if (headRef.current) {
      // Mirada/curiosidad permanente, más un leve asentimiento al caminar.
      headRef.current.rotation.y = Math.sin(t * 0.35) * 0.13;
      headRef.current.rotation.x = 0.04 + Math.sin(phase * 0.5) * 0.02 * intensity;
    }
  });

  return (
    <group ref={rootRef} position={[0, 0, CHARACTER_Z]} rotation={[0, Math.PI, 0]}>
      <group ref={hipsRef}>
        {/* Torso */}
        <mesh position={[0, 0.35, 0]} castShadow>
          <capsuleGeometry args={[0.24, 0.5, 4, 8]} />
          <meshStandardMaterial color={colors.personOutfit} roughness={0.9} />
        </mesh>

        {/* Cabeza */}
        <group ref={headRef} position={[0, 0.78, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.24, 16, 16]} />
            <meshStandardMaterial color={colors.personSkin} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.1, -0.02]} castShadow>
            <sphereGeometry args={[0.255, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial color={colors.personHair} roughness={0.9} />
          </mesh>
        </group>

        {/* Brazos */}
        <group ref={armLeftRef} position={[0.28, 0.55, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.34, 4, 6]} />
            <meshStandardMaterial color={colors.personSkin} roughness={0.85} />
          </mesh>
        </group>
        <group ref={armRightRef} position={[-0.28, 0.55, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.34, 4, 6]} />
            <meshStandardMaterial color={colors.personSkin} roughness={0.85} />
          </mesh>
        </group>

        {/* Piernas: el pivote está a la altura de la cadera; la malla
            cuelga hacia abajo hasta tocar el suelo (y=0 en el root). */}
        <group ref={legLeftRef} position={[0.11, 0, 0]}>
          <mesh position={[0, -HIP_HEIGHT / 2, 0]} castShadow>
            <capsuleGeometry args={[0.085, HIP_HEIGHT - 0.17, 4, 6]} />
            <meshStandardMaterial color={colors.personOutfitShadow} roughness={0.9} />
          </mesh>
        </group>
        <group ref={legRightRef} position={[-0.11, 0, 0]}>
          <mesh position={[0, -HIP_HEIGHT / 2, 0]} castShadow>
            <capsuleGeometry args={[0.085, HIP_HEIGHT - 0.17, 4, 6]} />
            <meshStandardMaterial color={colors.personOutfitShadow} roughness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
