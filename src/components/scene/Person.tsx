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
  const ponytailRef = useRef<THREE.Group>(null);
  const ponytailTipRef = useRef<THREE.Group>(null);

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

    // La coleta cuelga hacia atrás y acompaña el paso: rebota al doble de la
    // frecuencia de la zancada (un bote por pisada) y se balancea de lado con
    // la cadencia del paso. Aun parada mantiene un vaivén mínimo para que no
    // se vea rígida. La punta va con retraso respecto de la base, que es lo
    // que le da peso en vez de moverse como una pieza sólida.
    if (ponytailRef.current) {
      ponytailRef.current.rotation.x = 0.55 + Math.sin(phase * 2) * 0.13 * intensity;
      ponytailRef.current.rotation.z = Math.sin(phase) * 0.22 * intensity + Math.sin(t * 0.7) * 0.05;
    }
    if (ponytailTipRef.current) {
      ponytailTipRef.current.rotation.x = Math.sin(phase * 2 - 0.9) * 0.14 * intensity;
      ponytailTipRef.current.rotation.z = Math.sin(phase - 0.8) * 0.16 * intensity + Math.sin(t * 0.7 - 0.6) * 0.04;
    }
  });

  return (
    <group ref={rootRef} position={[0, 0, CHARACTER_Z]} rotation={[0, Math.PI, 0]}>
      <group ref={hipsRef}>
        {/* Torso */}
        <mesh position={[0, 0.35, 0]} castShadow>
          <capsuleGeometry args={[0.205, 0.54, 4, 8]} />
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

          {/* Coleta. El grupo cuelga de la nuca (la cámara va detrás, así que
              el -Z local es justo el lado visible) y sus eslabones crecen
              hacia abajo, de modo que `rotation.z` la balancea de lado y
              `rotation.x` la inclina hacia atrás. */}
          <group ref={ponytailRef} position={[0, 0.02, -0.235]} rotation={[0.55, 0, 0]}>
            {/* La base se hunde en el cráneo (radio 0.24) para que nazca del
                pelo sin costura. La inclinación de 0.55 rad la separa del
                torso: colgando recta atravesaba la cápsula del cuerpo. */}
            <mesh position={[0, -0.01, 0]} castShadow>
              <sphereGeometry args={[0.078, 10, 8]} />
              <meshStandardMaterial color={colors.personHair} roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.105, 0]} castShadow>
              <capsuleGeometry args={[0.061, 0.12, 4, 8]} />
              <meshStandardMaterial color={colors.personHair} roughness={0.9} />
            </mesh>
            <group ref={ponytailTipRef} position={[0, -0.195, 0]}>
              <mesh position={[0, -0.065, 0]} castShadow>
                <capsuleGeometry args={[0.043, 0.1, 4, 8]} />
                <meshStandardMaterial color={colors.personHair} roughness={0.9} />
              </mesh>
              <mesh position={[0, -0.135, 0]} castShadow>
                <sphereGeometry args={[0.031, 8, 6]} />
                <meshStandardMaterial color={colors.personHair} roughness={0.9} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Brazos */}
        <group ref={armLeftRef} position={[0.245, 0.55, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.061, 0.34, 4, 6]} />
            <meshStandardMaterial color={colors.personSkin} roughness={0.85} />
          </mesh>
        </group>
        <group ref={armRightRef} position={[-0.245, 0.55, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.061, 0.34, 4, 6]} />
            <meshStandardMaterial color={colors.personSkin} roughness={0.85} />
          </mesh>
        </group>

        {/* Piernas: el pivote está a la altura de la cadera; la malla
            cuelga hacia abajo hasta tocar el suelo (y=0 en el root). */}
        <group ref={legLeftRef} position={[0.1, 0, 0]}>
          <mesh position={[0, -HIP_HEIGHT / 2, 0]} castShadow>
            <capsuleGeometry args={[0.075, HIP_HEIGHT - 0.17, 4, 6]} />
            <meshStandardMaterial color={colors.personOutfitShadow} roughness={0.9} />
          </mesh>
        </group>
        <group ref={legRightRef} position={[-0.1, 0, 0]}>
          <mesh position={[0, -HIP_HEIGHT / 2, 0]} castShadow>
            <capsuleGeometry args={[0.075, HIP_HEIGHT - 0.17, 4, 6]} />
            <meshStandardMaterial color={colors.personOutfitShadow} roughness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
