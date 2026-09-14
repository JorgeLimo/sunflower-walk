import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import { createSeededRandom, randomBetween } from '../../lib/random';
import { MOUNTAIN_LOOP_LENGTH } from '../../lib/constants';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { getCycleProgress, getSkyState, createSkyState, getSunArcAngle } from '../../lib/dayNightCycle';
import type { SkyState } from '../../lib/dayNightCycle';

/** Mismo arco visual que usa `Sun.tsx`, para que la luz direccional que
 * realmente ilumina la escena gire junto con el disco solar visible en vez
 * de quedarse fija — así las sombras cambian de dirección a lo largo del
 * día en vez de sentirse pegadas a un solo ángulo. */
const SUN_LIGHT_ARC_WIDTH = 26;
const SUN_LIGHT_HEIGHT = 24;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  varying vec3 vWorldPosition;
  void main() {
    float h = normalize(vWorldPosition).y;
    float t = clamp(h * 1.5 + 0.2, 0.0, 1.0);
    gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
  }
`;

function SkyDome({ skyState }: { skyState: SkyState }) {
  const uniforms = useMemo(
    () => ({
      topColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
    }),
    [],
  );

  useFrame(() => {
    uniforms.topColor.value.copy(skyState.skyTop);
    uniforms.horizonColor.value.copy(skyState.skyHorizon);
  });

  return (
    <mesh>
      <sphereGeometry args={[150, 24, 16]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

interface MountainSpec {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  height: number;
  rotationY: number;
}

function generateMountains(): MountainSpec[] {
  const random = createSeededRandom(2024);
  const specs: MountainSpec[] = [];
  const span = MOUNTAIN_LOOP_LENGTH * 1.5;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 20; i++) {
      specs.push({
        x: side * randomBetween(random, 70, 130),
        z: randomBetween(random, -span, span),
        radiusX: randomBetween(random, 20, 40),
        radiusZ: randomBetween(random, 20, 40),
        height: randomBetween(random, 16, 30),
        rotationY: random() * Math.PI,
      });
    }
  }
  return specs;
}

const MOUNTAINS = generateMountains();

/**
 * Colinas bajas y redondeadas (nada de picos geométricos afilados). El
 * grupo entero se re-ancla usando el RESTO de la distancia recorrida
 * módulo MOUNTAIN_LOOP_LENGTH — nunca la distancia cruda — así que su
 * posición se mantiene siempre acotada cerca del personaje sin importar
 * cuánto se haya scrolleado, y jamás cambian de escala ni de forma.
 */
function Mountains() {
  const scrollState = useScrollState();
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), []);

  useFrame(() => {
    if (!groupRef.current) return;
    const distance = scrollState.current.smoothDistance;
    const remainder = ((distance % MOUNTAIN_LOOP_LENGTH) + MOUNTAIN_LOOP_LENGTH) % MOUNTAIN_LOOP_LENGTH;
    groupRef.current.position.z = CHARACTER_Z - remainder;
  });

  return (
    <group ref={groupRef}>
      {MOUNTAINS.map((m, i) => (
        <mesh
          key={i}
          geometry={geometry}
          position={[m.x, -m.height * 0.28, m.z]}
          scale={[m.radiusX, m.height, m.radiusZ]}
          rotation={[0, m.rotationY, 0]}
          receiveShadow
        >
          {/* Un poco de emisivo constante para que la silueta nunca se
              funda por completo con el cielo, sin importar el ángulo de
              la luz — sin esto, de noche podían quedar casi invisibles. */}
          <meshStandardMaterial
            color={colors.mountainFar}
            emissive={colors.mountainFar}
            emissiveIntensity={0.12}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  );
}

interface EnvironmentProps {
  shadowMapSize: number;
}

/**
 * Atmósfera de la escena: cielo en degradado dinámico, niebla, luces y
 * colinas lejanas — todo impulsado por el ciclo día/noche (ver
 * `dayNightCycle.ts`). La transición día→noche se resuelve ÚNICAMENTE
 * mediante iluminación (dos luces direccionales — sol cálido que se apaga,
 * luna fría que toma el relevo como relleno — más ambiente/hemisferio con
 * un piso mínimo alto) y niebla; ningún material de girasol, camino o
 * personaje cambia de color directamente, así que todo sigue siendo
 * reconocible de noche.
 */
export function Environment({ shadowMapSize }: EnvironmentProps) {
  const { gl } = useThree();
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;
  const ambientColor = useRef(new THREE.Color()).current;

  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const sunTargetRef = useRef<THREE.Object3D>(null);
  const moonLightRef = useRef<THREE.DirectionalLight>(null);
  const moonTargetRef = useRef<THREE.Object3D>(null);
  const fogRef = useRef<THREE.FogExp2>(null);

  // El target de cada luz direccional debe ser un objeto real de la
  // escena. Como el personaje ahora permanece fijo en CHARACTER_Z, tanto
  // la luz como su target quedan fijos también — se configuran una sola
  // vez, no en cada frame.
  useEffect(() => {
    if (sunRef.current && sunTargetRef.current) sunRef.current.target = sunTargetRef.current;
    if (moonLightRef.current && moonTargetRef.current) moonLightRef.current.target = moonTargetRef.current;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
  }, [gl]);

  useFrame((state) => {
    const distance = scrollState.current.smoothDistance;
    const cycle = getCycleProgress(distance);
    getSkyState(cycle, skyState);

    if (sunRef.current) {
      const angle = getSunArcAngle(cycle);
      sunRef.current.position.set(Math.cos(angle) * SUN_LIGHT_ARC_WIDTH, Math.sin(angle) * SUN_LIGHT_HEIGHT + 4, CHARACTER_Z + 12);
    }

    if (fogRef.current) {
      fogRef.current.color.copy(skyState.fogColor);
      fogRef.current.density = skyState.fogDensity;
    }
    if (hemiRef.current) {
      // Rebote ambiental del cielo sobre el paisaje: usa `groundLightColor`
      // (cálido, separado a propósito de `skyTop`) para que el cielo pueda
      // verse más azul sin enfriar la iluminación del suelo/girasoles.
      hemiRef.current.color.copy(skyState.groundLightColor);
      hemiRef.current.intensity = skyState.hemiIntensity;
    }
    if (ambientRef.current) {
      ambientColor.copy(skyState.sunLightColor).lerp(skyState.moonLightColor, skyState.nightFactor);
      ambientRef.current.intensity = skyState.ambientIntensity;
      ambientRef.current.color.copy(ambientColor);
    }
    if (sunRef.current) {
      // Variación muy sutil (como nubes finas pasando frente al sol) para
      // que la luz del día no se sienta perfectamente estática.
      const shimmer = 1 + Math.sin(state.clock.elapsedTime * 0.15) * 0.018;
      sunRef.current.intensity = skyState.sunLightIntensity * shimmer;
      sunRef.current.color.copy(skyState.sunLightColor);
    }
    if (moonLightRef.current) {
      moonLightRef.current.intensity = skyState.moonLightIntensity;
      moonLightRef.current.color.copy(skyState.moonLightColor);
    }
    gl.toneMappingExposure = skyState.exposure;
  });

  return (
    <>
      <SkyDome skyState={skyState} />
      <Mountains />
      <fogExp2 ref={fogRef} attach="fog" args={[colors.fogColor, 0.01]} />

      <hemisphereLight ref={hemiRef} args={[colors.skyTop, colors.groundNear, 0.6]} />
      <ambientLight ref={ambientRef} intensity={0.3} color={colors.sunGlow} />

      {/* Sol: luz cálida principal, proyecta las sombras. */}
      <directionalLight
        ref={sunRef}
        position={[-18, 22, CHARACTER_Z + 12]}
        intensity={1.7}
        color="#fff1cf"
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0015}
      />
      <object3D ref={sunTargetRef} position={[0, 0, CHARACTER_Z]} />

      {/* Luna: luz de relleno fría, sin sombra propia (releva al sol de
          noche para que las formas se sigan viendo). */}
      <directionalLight
        ref={moonLightRef}
        position={[24, 16, CHARACTER_Z - 10]}
        intensity={0}
        color="#aab4ff"
      />
      <object3D ref={moonTargetRef} position={[0, 0, CHARACTER_Z]} />
    </>
  );
}
