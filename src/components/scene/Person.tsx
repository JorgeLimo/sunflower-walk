import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { colors } from '../../lib/colors';
import { damp, clamp } from '../../lib/random';
import { TILE_LENGTH, VELOCITY_FOR_FULL_WALK } from '../../lib/constants';
import { HelpBubble } from './HelpBubble';
import { generateTileGreeters, type GreeterLocal } from '../../lib/generateTileGreeters';

// Ritmo natural de la zancada (frecuencia del ciclo de piernas/brazos). Una
// ronda anterior lo triplicó buscando una "caminata más rápida", pero eso
// solo aceleraba la ANIMACIÓN — la distancia real recorrida (que depende
// únicamente de `scrollState.current.velocity`, nunca de esto) seguía
// igual, así que el resultado se veía como correr en el lugar. El avance
// real 3 veces más rápido ahora sale de `VELOCITY_FOR_FULL_WALK` (ver
// constants.ts); acá se mantiene el ritmo original para que cada zancada
// cubra más distancia real en vez de volverse una carrera.
const WALK_FREQ = 5.2;
const LEG_SWING = 0.55;
const ARM_SWING = 0.5;
const HIP_HEIGHT = 0.62;

// --- Reacción de alegría al pasar junto a un cartel ---
// Distancia (en Z, hacia adelante) a la que el cartel está de ella cuando
// dispara la reacción: apenas por delante, como si lo acabara de leer.
const REACT_AHEAD = 1.6;
const REACT_DURATION = 1.15;
// Solo algunos carteles la provocan (decisión fija por cartel, ver
// `reactsToGreeter`) y, además, nunca dos reacciones seguidas.
const REACT_CHANCE = 0.3;
const REACT_COOLDOWN_S = 9;
const REACT_MAX_LATERAL = 5.3;
const REACT_MIN_INTENSITY = 0.35;
const smooth = THREE.MathUtils.smoothstep;

/** Hash estable [0,1) por cartel: el mismo cartel siempre da (o no) la
 * misma respuesta, sin estado ni aleatoriedad por cuadro. */
function reactsToGreeter(tileIndex: number, g: GreeterLocal): boolean {
  const h = Math.sin(tileIndex * 12.9898 + g.z * 78.233 + g.x * 37.719) * 43758.5453;
  return h - Math.floor(h) < REACT_CHANCE;
}

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
  const reactTime = useRef(-1);
  const lastReactAt = useRef(-Infinity);
  const prevDistance = useRef<number | null>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const targetIntensity = clamp(Math.abs(scrollState.current.velocity) / VELOCITY_FOR_FULL_WALK, 0, 1);
    walkIntensity.current = damp(walkIntensity.current, targetIntensity, 5, delta);
    const intensity = walkIntensity.current;

    gaitPhase.current += delta * WALK_FREQ * intensity;
    const phase = gaitPhase.current;

    // --- ¿Está pasando junto a un cartel? Cruce hacia adelante de la marca
    // `REACT_AHEAD` entre el cuadro anterior y este (no hace falta guardar
    // más estado). La posición de mundo de un cartel es `distancia -
    // índice*TILE_LENGTH + z`, relativa a ella. ---
    const distance = scrollState.current.smoothDistance;
    const prev = prevDistance.current;
    prevDistance.current = distance;
    if (prev !== null && distance > prev && reactTime.current < 0 && intensity > REACT_MIN_INTENSITY && t - lastReactAt.current > REACT_COOLDOWN_S) {
      const centerIndex = Math.floor(distance / TILE_LENGTH);
      search: for (let idx = centerIndex - 1; idx <= centerIndex + 1; idx++) {
        const tile = generateTileGreeters(idx);
        for (const g of [tile.left, tile.right, tile.farLeft, tile.farRight]) {
          if (!g || Math.abs(g.x) > REACT_MAX_LATERAL) continue;
          const rel = -REACT_AHEAD;
          const before = prev - idx * TILE_LENGTH + g.z;
          const now = distance - idx * TILE_LENGTH + g.z;
          if (before < rel && now >= rel && reactsToGreeter(idx, g)) {
            reactTime.current = 0;
            lastReactAt.current = t;
            break search;
          }
        }
      }
    }

    // Brazos arriba (raise) y un saltito (jumpY): 0→1→0 suave, encima de la
    // caminata — que NO se detiene: piernas y avance siguen igual.
    let raise = 0;
    let jumpY = 0;
    if (reactTime.current >= 0) {
      reactTime.current += delta;
      const u = reactTime.current / REACT_DURATION;
      if (u >= 1) {
        reactTime.current = -1;
      } else {
        raise = smooth(u, 0, 0.2) * (1 - smooth(u, 0.78, 1));
        const ju = clamp((u - 0.17) / 0.56, 0, 1);
        jumpY = Math.sin(ju * Math.PI) * 0.16;
      }
    }

    if (rootRef.current) {
      rootRef.current.rotation.z = Math.sin(phase) * 0.025 * intensity;
    }

    if (hipsRef.current) {
      const walkBob = Math.abs(Math.sin(phase)) * 0.05 * intensity;
      const idleBreath = Math.sin(t * 0.8) * 0.012 * (1 - intensity * 0.5);
      hipsRef.current.position.y = HIP_HEIGHT + walkBob + idleBreath + jumpY;
    }

    // En el aire las piernas suavizan su vaivén (sin quedarse rígidas).
    const legAmp = LEG_SWING * intensity * (jumpY > 0.01 ? 0.55 : 1);
    if (legLeftRef.current) legLeftRef.current.rotation.x = Math.sin(phase) * legAmp;
    if (legRightRef.current) legRightRef.current.rotation.x = Math.sin(phase + Math.PI) * legAmp;
    // Con la reacción, el vaivén de los brazos se funde a cero y suben por
    // los costados hasta arriba (rotación en Z), con un leve aleteo alegre.
    const armFlutter = Math.sin(t * 15) * 0.09 * raise;
    if (armLeftRef.current) {
      armLeftRef.current.rotation.x = Math.sin(phase + Math.PI) * ARM_SWING * intensity * (1 - raise);
      armLeftRef.current.rotation.z = raise * 2.75 + armFlutter;
    }
    if (armRightRef.current) {
      armRightRef.current.rotation.x = Math.sin(phase) * ARM_SWING * intensity * (1 - raise);
      armRightRef.current.rotation.z = -raise * 2.75 - armFlutter;
    }

    if (headRef.current) {
      // Mirada/curiosidad permanente, más un leve asentimiento al caminar.
      headRef.current.rotation.y = Math.sin(t * 0.35) * 0.13;
      headRef.current.rotation.x = 0.04 + Math.sin(phase * 0.5) * 0.02 * intensity - 0.12 * raise;
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

        <HelpBubble position={[0, 1.72, 0]} />

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
            <meshStandardMaterial color={colors.personJeans} roughness={0.9} />
          </mesh>
          {/* Zapatilla blanca sencilla: cuerpo achatado + suela clara. */}
          <mesh position={[0, -HIP_HEIGHT + 0.05, 0.045]} scale={[0.95, 0.62, 1.55]} castShadow>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={colors.personShoe} roughness={0.7} />
          </mesh>
          <mesh position={[0, -HIP_HEIGHT + 0.012, 0.05]} scale={[1, 0.28, 1.68]}>
            <sphereGeometry args={[0.085, 12, 8]} />
            <meshStandardMaterial color={colors.personSole} roughness={0.85} />
          </mesh>
        </group>
        <group ref={legRightRef} position={[-0.1, 0, 0]}>
          <mesh position={[0, -HIP_HEIGHT / 2, 0]} castShadow>
            <capsuleGeometry args={[0.075, HIP_HEIGHT - 0.17, 4, 6]} />
            <meshStandardMaterial color={colors.personJeans} roughness={0.9} />
          </mesh>
          {/* Zapatilla blanca sencilla: cuerpo achatado + suela clara. */}
          <mesh position={[0, -HIP_HEIGHT + 0.05, 0.045]} scale={[0.95, 0.62, 1.55]} castShadow>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={colors.personShoe} roughness={0.7} />
          </mesh>
          <mesh position={[0, -HIP_HEIGHT + 0.012, 0.05]} scale={[1, 0.28, 1.68]}>
            <sphereGeometry args={[0.085, 12, 8]} />
            <meshStandardMaterial color={colors.personSole} roughness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
