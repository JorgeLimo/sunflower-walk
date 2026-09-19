import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollState } from '../story/scrollContext';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';
import { experience } from '../../lib/experienceStore';
import { BANNER_TALL, BANNER_WIDE } from '../../lib/airplaneBannerTexture';
import { randomBetween } from '../../lib/random';

// La primera aparición llega ~30 s después de presionar "Entrar" y las
// siguientes ~2 min después de que empezó la anterior. Cada vuelo dura menos
// de 30 s, así que nunca hay dos aviones a la vez.
const FIRST_SPAWN_S = 30;
const INTERVAL_S = 120;
const JITTER_S = 4;

// Distancia (a lo largo de la vista de la cámara) a la que vuela: lejos, en
// el cielo, por detrás de todo lo demás. Todo el evento vive en coordenadas
// de PANTALLA (fracciones del ancho visible a esa distancia), así que ocupa
// lo mismo en escritorio y en móvil y no depende de dónde esté el mundo.
const DEPTH = 80;
const FLAG_SEGMENTS_X = 48;
const FLAG_SEGMENTS_Y = 8;

interface Layout {
  tall: boolean;
  /** Largo de la bandera, en anchos de pantalla. */
  flagLength: number;
  /** Largo del avión, en anchos de pantalla. */
  planeLength: number;
  /** Velocidad horizontal, en anchos de pantalla por segundo. */
  speed: number;
}

interface Flight {
  time: number;
  duration: number;
  layout: Layout;
  x0: number;
  x1: number;
  /** Altura del centro del avión, en anchos de pantalla. */
  y: number;
  climb: number;
  waves: number;
  omega: number;
  ampY: number;
  ampZ: number;
  phase: number;
  roll: number;
}

function pickLayout(aspect: number): Layout {
  if (aspect < 0.85) return { tall: true, flagLength: 0.45, planeLength: 0.16, speed: 0.11 };
  if (aspect < 1.3) return { tall: false, flagLength: 0.36, planeLength: 0.1, speed: 0.1 };
  return { tall: false, flagLength: 0.23, planeLength: 0.075, speed: 0.1 };
}

/** Bandera normalizada: ancho 1 (de x=-1 a x=0, el borde 0 es el que va
 * atado al avión) y alto 1/aspect. Se escala luego al largo real. */
function createFlagGeometry(aspect: number) {
  const geo = new THREE.PlaneGeometry(1, 1 / aspect, FLAG_SEGMENTS_X, FLAG_SEGMENTS_Y);
  geo.translate(-0.5, 0, 0);
  const base = (geo.attributes.position.array as Float32Array).slice();
  return { geo, base, height: 1 / aspect };
}

function createPlaneParts() {
  const cream = new THREE.MeshStandardMaterial({ color: '#fbf1dc', roughness: 0.75 });
  const red = new THREE.MeshStandardMaterial({ color: '#d9694f', roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: '#7fa8c9', roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#4a3f35', roughness: 0.8 });
  for (const m of [cream, red, glass, dark]) m.fog = false;
  return { cream, red, glass, dark };
}

/**
 * Evento ambiental: un avioncito atraviesa el cielo de izquierda a derecha
 * arrastrando una bandera de tela con el mensaje. Aparece a los ~30 s de
 * empezar el recorrido y luego cada ~60 s; completa su trayectoria, sale por
 * la derecha y queda oculto hasta la siguiente vez. No toca nada de la
 * escena: se dibuja pegado a la cámara (en pantalla, en la franja del
 * cielo), muy lejos de la protagonista, los animales y los carteles.
 */
export function Airplane() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scrollState = useScrollState();
  const skyState = useRef(createSkyState()).current;

  const rootRef = useRef<THREE.Group>(null);
  const planeRef = useRef<THREE.Group>(null);
  const propRef = useRef<THREE.Group>(null);
  const flagGroupRef = useRef<THREE.Group>(null);
  const wideRef = useRef<THREE.Mesh>(null);
  const tallRef = useRef<THREE.Mesh>(null);
  const ropesRef = useRef<THREE.LineSegments>(null);
  const poleRef = useRef<THREE.Mesh>(null);
  const navLeftRef = useRef<THREE.Mesh>(null);
  const navRightRef = useRef<THREE.Mesh>(null);

  const parts = useMemo(createPlaneParts, []);
  const wide = useMemo(() => createFlagGeometry(BANNER_WIDE.aspect), []);
  const tall = useMemo(() => createFlagGeometry(BANNER_TALL.aspect), []);
  const flagMaterialWide = useMemo(() => makeFlagMaterial(BANNER_WIDE.texture), []);
  const flagMaterialTall = useMemo(() => makeFlagMaterial(BANNER_TALL.texture), []);
  const ropeGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    return g;
  }, []);
  const ropeMaterial = useMemo(() => new THREE.LineBasicMaterial({ color: '#6b5a4a', fog: false }), []);
  const navRedMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff4a3a', fog: false }), []);
  const navGreenMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#4aff7a', fog: false }), []);

  // Reloj de pared (no suma de deltas): si el equipo va lento, los tiempos
  // de 30/60 s siguen siendo segundos reales.
  const startedAt = useRef<number | null>(null);
  const elapsed = useRef(0);
  const nextSpawnAt = useRef(FIRST_SPAWN_S + randomBetween(Math.random, -JITTER_S, JITTER_S));
  const flight = useRef<Flight | null>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const root = rootRef.current;
    if (!root) return;

    if (experience.started) {
      if (startedAt.current === null) startedAt.current = state.clock.elapsedTime;
      elapsed.current = state.clock.elapsedTime - startedAt.current;
    }

    // --- Arranque de un vuelo ---
    if (!flight.current && experience.started && elapsed.current >= nextSpawnAt.current) {
      const aspect = camera.aspect;
      const layout = pickLayout(aspect);
      const banner = layout.tall ? BANNER_TALL : BANNER_WIDE;
      const flagHeight = layout.flagLength / banner.aspect;
      // Altura en la franja del cielo (arriba del horizonte), según el
      // alto de la bandera, con variación de un vuelo a otro.
      const ndcPerUnit = 2 * aspect;
      const flagNdc = flagHeight * ndcPerUnit;
      const lo = 0.34 + flagNdc / 2;
      const hi = Math.max(lo + 0.02, 0.9 - flagNdc / 2);
      const yNdc = randomBetween(Math.random, lo, hi);
      const speed = layout.speed * randomBetween(Math.random, 0.88, 1.14);
      const x0 = -0.5 - layout.planeLength * 0.6;
      const x1 = 0.5 + layout.flagLength + layout.planeLength * 0.7 + 0.06;
      flight.current = {
        time: 0,
        duration: (x1 - x0) / speed,
        layout: { ...layout, speed },
        x0,
        x1,
        y: yNdc / ndcPerUnit,
        climb: randomBetween(Math.random, -0.03, 0.03),
        waves: randomBetween(Math.random, 1.3, 2.1),
        omega: randomBetween(Math.random, 1.7, 2.6),
        ampY: randomBetween(Math.random, 0.1, 0.17),
        ampZ: randomBetween(Math.random, 0.3, 0.5),
        phase: Math.random() * Math.PI * 2,
        roll: randomBetween(Math.random, -0.07, 0.07),
      };
      nextSpawnAt.current = elapsed.current + INTERVAL_S + randomBetween(Math.random, -JITTER_S, JITTER_S);

      const l = flight.current.layout;
      const fh = l.flagLength / banner.aspect;
      const tailX = -l.planeLength * 0.52;
      const ropeLen = l.planeLength * 0.4;
      // El borde atado de la bandera queda un poco detrás del avión.
      const poleX = tailX - ropeLen;
      if (flagGroupRef.current) flagGroupRef.current.position.set(poleX, 0, 0);
      if (poleRef.current) {
        poleRef.current.scale.set(l.planeLength * 0.02, fh * 1.04, l.planeLength * 0.02);
        poleRef.current.position.set(poleX, 0, 0);
      }
      const rp = ropeGeometry.attributes.position as THREE.BufferAttribute;
      rp.setXYZ(0, tailX, planeTail(l.planeLength), 0);
      rp.setXYZ(1, poleX, fh * 0.52, 0);
      rp.setXYZ(2, tailX, planeTail(l.planeLength), 0);
      rp.setXYZ(3, poleX, -fh * 0.52, 0);
      rp.needsUpdate = true;
      if (wideRef.current) {
        wideRef.current.visible = !l.tall;
        wideRef.current.scale.setScalar(l.flagLength);
      }
      if (tallRef.current) {
        tallRef.current.visible = l.tall;
        tallRef.current.scale.setScalar(l.flagLength);
      }
      if (planeRef.current) planeRef.current.scale.setScalar(l.planeLength);
    }

    const f = flight.current;
    if (!f) {
      root.visible = false;
      return;
    }

    f.time += delta;
    if (f.time >= f.duration) {
      // Ya salió por la derecha: se oculta del todo hasta la próxima vez.
      flight.current = null;
      root.visible = false;
      return;
    }

    getSkyState(getCycleProgress(scrollState.current.smoothDistance), skyState);
    const night = skyState.nightFactor;

    // --- Posición en pantalla → mundo (pegado a la cámara) ---
    const halfH = DEPTH * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const width = 2 * halfH * camera.aspect;
    const px = f.x0 + f.layout.speed * f.time;
    const bob = Math.sin(state.clock.elapsedTime * 0.9 + f.phase) * 0.004;
    const py = f.y + f.climb * (f.time / f.duration) + bob;
    camera.updateMatrixWorld();
    root.position.copy(camera.localToWorld(tmp.set(px * width, py * width, -DEPTH)));
    root.quaternion.copy(camera.quaternion);
    root.scale.setScalar(width);
    root.visible = true;

    if (planeRef.current) {
      // 3/4 hacia la cámara, con un leve balanceo y cabeceo.
      planeRef.current.rotation.set(0, -0.42, f.roll + Math.sin(state.clock.elapsedTime * 0.8 + f.phase) * 0.035 + f.climb * 2);
    }
    if (propRef.current) propRef.current.rotation.x = state.clock.elapsedTime * 55;

    // Luces de posición: parpadean, se notan más de noche.
    const blink = (Math.sin(state.clock.elapsedTime * 7) > 0.2 ? 1 : 0.25) * (0.35 + 0.65 * night);
    navRedMaterial.color.setRGB(1 * blink, 0.29 * blink, 0.23 * blink);
    navGreenMaterial.color.setRGB(0.29 * blink, 1 * blink, 0.48 * blink);

    // De noche el avión y la tela se aclaran un poco para que se lean.
    const emissive = 0.22 + night * 0.5;
    for (const m of [flagMaterialWide, flagMaterialTall]) m.emissiveIntensity = emissive;
    for (const m of [parts.cream, parts.red]) {
      m.emissive.set(m.color);
      m.emissiveIntensity = night * 0.35;
    }

    // --- Tela: onda que viaja hacia la cola y crece con la distancia al
    // avión (el borde atado apenas se mueve), con oleaje también hacia la
    // cámara para que atrape luz y sombra como una tela de verdad ---
    const flagData = f.layout.tall ? tall : wide;
    const mesh = f.layout.tall ? tallRef.current : wideRef.current;
    if (mesh) {
      const pos = flagData.geo.attributes.position as THREE.BufferAttribute;
      const base = flagData.base;
      const h = flagData.height;
      const t = state.clock.elapsedTime;
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3];
        const by = base[i * 3 + 1];
        const u = -bx;
        const v = by / h;
        const amp = Math.pow(u, 1.25);
        const wave = 2 * Math.PI * f.waves * u - f.omega * t + f.phase;
        const dy = amp * f.ampY * h * Math.sin(wave) + amp * 0.025 * h * Math.sin(wave * 2.3 + v * 3);
        const dz = amp * f.ampZ * h * Math.sin(wave * 0.92 + v * 2.2 + f.phase * 0.7);
        const dx = amp * 0.008 * Math.sin(wave * 1.4);
        const flutter = u > 0.85 ? (u - 0.85) * 0.2 * h * Math.sin(t * 9 + v * 4 + f.phase) : 0;
        pos.setXYZ(i, bx + dx, by + dy + flutter - 0.06 * h * u * u, dz);
      }
      pos.needsUpdate = true;
      flagData.geo.computeVertexNormals();
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      <group ref={planeRef}>
        {/* Avioncito: largo 1 (nariz hacia +X) — se escala al largo real. */}
        <mesh rotation={[0, 0, Math.PI / 2]} material={parts.cream}>
          <capsuleGeometry args={[0.085, 0.62, 4, 12]} />
        </mesh>
        <mesh position={[0.4, 0, 0]} material={parts.red}>
          <sphereGeometry args={[0.092, 12, 10]} />
        </mesh>
        <mesh position={[0.08, 0.085, 0]} scale={[1.6, 0.8, 1]} material={parts.glass}>
          <sphereGeometry args={[0.06, 10, 8]} />
        </mesh>
        <mesh position={[0.05, 0.13, 0]} material={parts.cream}>
          <boxGeometry args={[0.3, 0.024, 0.98]} />
        </mesh>
        <mesh position={[0.05, 0.13, 0.49]} material={parts.red}>
          <boxGeometry args={[0.3, 0.026, 0.06]} />
        </mesh>
        <mesh position={[0.05, 0.13, -0.49]} material={parts.red}>
          <boxGeometry args={[0.3, 0.026, 0.06]} />
        </mesh>
        <mesh position={[0.1, 0.06, 0.16]} rotation={[0.25, 0, 0]} material={parts.dark}>
          <boxGeometry args={[0.015, 0.16, 0.015]} />
        </mesh>
        <mesh position={[0.1, 0.06, -0.16]} rotation={[-0.25, 0, 0]} material={parts.dark}>
          <boxGeometry args={[0.015, 0.16, 0.015]} />
        </mesh>
        <mesh position={[-0.42, 0.14, 0]} rotation={[0, 0, 0.18]} material={parts.red}>
          <boxGeometry args={[0.2, 0.26, 0.02]} />
        </mesh>
        <mesh position={[-0.42, 0.04, 0]} material={parts.cream}>
          <boxGeometry args={[0.17, 0.02, 0.38]} />
        </mesh>
        <mesh ref={navLeftRef} position={[0.05, 0.13, 0.53]} material={navRedMaterial}>
          <sphereGeometry args={[0.025, 6, 6]} />
        </mesh>
        <mesh ref={navRightRef} position={[0.05, 0.13, -0.53]} material={navGreenMaterial}>
          <sphereGeometry args={[0.025, 6, 6]} />
        </mesh>
        <group ref={propRef} position={[0.5, 0, 0]}>
          <mesh material={parts.dark}>
            <boxGeometry args={[0.02, 0.36, 0.035]} />
          </mesh>
          <mesh material={parts.dark}>
            <boxGeometry args={[0.02, 0.035, 0.36]} />
          </mesh>
        </group>
      </group>

      {/* Cuerdas, varilla y tela (en el plano de la pantalla). */}
      <lineSegments ref={ropesRef} geometry={ropeGeometry} material={ropeMaterial} />
      <mesh ref={poleRef} material={parts.dark}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <group ref={flagGroupRef}>
        <mesh ref={wideRef} geometry={wide.geo} material={flagMaterialWide} />
        <mesh ref={tallRef} geometry={tall.geo} material={flagMaterialTall} visible={false} />
      </group>
    </group>
  );
}

/** Altura (en unidades del avión) del punto de la cola donde se atan las cuerdas. */
function planeTail(planeLength: number): number {
  return planeLength * 0.03;
}

function makeFlagMaterial(map: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    map,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: map,
    emissiveIntensity: 0.22,
    roughness: 0.9,
    side: THREE.DoubleSide,
    fog: false,
  });
}
