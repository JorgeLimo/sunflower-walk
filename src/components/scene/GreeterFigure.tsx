import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '../../lib/colors';
import type { GreeterLocal } from '../../lib/generateTileGreeters';
import type { GreeterPose } from '../../lib/greeterContent';
import { GREETER_SIGN_TEXTURES, GREETER_SIGN_GLOW_TEXTURE, SIGN_ASPECT } from '../../lib/greeterSignTexture';
import { GREETER_FACE_TEXTURES } from '../../lib/greeterFaceTexture';
import { greeterNightState } from '../../lib/greeterNightState';

// El campo de girasoles/tulipanes/lirios es denso desde el mismo borde del
// camino (sin ningún tramo despejado donde ubicarlas sin quedar tapadas),
// así que la personita necesita ser lo bastante alta como para asomar por
// encima del follaje vecino — sigue siendo más baja que la protagonista
// (1.64 de alto) pero ronda la altura de un girasol maduro (1.6) en vez de
// quedar enterrada entre tallos.
const FIGURE_SCALE = 1.7;

const SIGN_WIDTH = 0.46;
const SIGN_HEIGHT = SIGN_WIDTH / SIGN_ASPECT;

// Cuánto se enciende el cartel/piel de noche. Moderado a propósito — el
// pedido es "pequeño cartel luminoso" cálido, nunca un letrero de neón.
const SIGN_NIGHT_GLOW = 0.55;
const SIGN_HALO_NIGHT_OPACITY = 0.5;
const SKIN_NIGHT_GLOW = 0.3;

interface PoseConfig {
  /** [x, z] en radianes; x = adelante/atrás (negativo = brazo sube hacia
   * +Z local), z = afuera/arriba (izquierda positivo, derecha negativo). */
  armLeft: [number, number];
  armRight: [number, number];
  legSpread: number;
  signPosition: [number, number, number];
  signTilt: number;
  lean: number;
}

// Ángulos calibrados a ojo (mismo criterio que el resto de la escena: una
// aproximación estilizada, no una IK real) para que cada pose se lea
// claramente distinta desde lejos. El MOVIMIENTO propio de cada una (lo que
// las hace sentir vivas en vez de figuras clavadas) se aplica cuadro a
// cuadro en useFrame, encima de estos ángulos base — ver el switch más
// abajo. NINGUNA de estas poses ni el switch de useFrame cambiaron en esta
// pasada — solo la geometría (ver más abajo) que esos mismos grupos mueven.
const POSE_TABLE: Record<GreeterPose, PoseConfig> = {
  front: {
    armLeft: [-1.35, 0.2],
    armRight: [-1.35, -0.2],
    legSpread: 0.06,
    signPosition: [0, 0.5, 0.24],
    signTilt: -0.12,
    lean: 0,
  },
  overhead: {
    armLeft: [-0.55, 2.7],
    armRight: [-0.55, -2.7],
    legSpread: 0.06,
    // El cartel NO acompaña a los brazos hacia arriba (ver nota en el
    // pedido: nunca debe acercarse a la altura de la cabeza) — queda a la
    // misma altura "segura" que en el resto de las poses mientras los
    // brazos igual se estiran bien alto, como si la persona festejara con
    // los brazos y dejara el cartel apoyado tranquilo a su lado.
    signPosition: [0, 0.46, 0.22],
    signTilt: -0.12,
    lean: 0,
  },
  armsUp: {
    armLeft: [-0.1, 2.25],
    armRight: [-0.1, -2.25],
    legSpread: 0.08,
    signPosition: [0.17, 0.36, 0.22],
    signTilt: -0.12,
    lean: 0,
  },
  jump: {
    armLeft: [-0.9, 1.35],
    armRight: [-0.9, -1.35],
    legSpread: 0.15,
    signPosition: [0, 0.47, 0.24],
    signTilt: -0.1,
    lean: 0,
  },
  celebrate: {
    armLeft: [-0.25, 2.6],
    armRight: [-0.95, -0.35],
    legSpread: 0.07,
    signPosition: [-0.16, 0.34, 0.22],
    signTilt: -0.12,
    lean: 0.1,
  },
};

const HIP_HEIGHT = 0.34;
// Alto del torso (perfil tallado, ver `buildTorsoGeometry`): del cinturón
// (y=0 local) a la base del cuello (y=TORSO_HEIGHT local).
const TORSO_HEIGHT = 0.32;
const NECK_HEIGHT = 0.09;
const SHOULDER_Y = HIP_HEIGHT + TORSO_HEIGHT * 0.86;
const NECK_Y = HIP_HEIGHT + TORSO_HEIGHT + NECK_HEIGHT / 2;
const HEAD_Y = NECK_Y + NECK_HEIGHT / 2 + 0.085;

/**
 * Torso con perfil tallado a mano (cintura → pecho → hombros → cuello) en
 * vez de una cápsula uniforme: es lo que más pesaba en la sensación de
 * "muñeco de bloques" — un cilindro con las puntas redondeadas nunca va a
 * leerse como un torso real, sin importar cuántos segmentos tenga. El
 * mismo perfil, al revolucionarlo, ya sugiere algo de volumen de ropa sin
 * necesitar una capa aparte.
 */
function buildTorsoGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.086, 0),
    new THREE.Vector2(0.095, 0.045),
    new THREE.Vector2(0.089, 0.12),
    new THREE.Vector2(0.099, 0.2),
    new THREE.Vector2(0.104, TORSO_HEIGHT * 0.86),
    new THREE.Vector2(0.055, TORSO_HEIGHT),
  ];
  const geo = new THREE.LatheGeometry(profile, 20);
  geo.computeVertexNormals();
  return geo;
}

const legGeometry = new THREE.CapsuleGeometry(0.05, HIP_HEIGHT - 0.1, 4, 12);
const footGeometry = new THREE.SphereGeometry(0.058, 12, 8);
const armGeometry = new THREE.CapsuleGeometry(0.043, 0.205, 4, 12);
const handGeometry = new THREE.SphereGeometry(0.049, 12, 8);
const neckGeometry = new THREE.CylinderGeometry(0.042, 0.058, NECK_HEIGHT, 12);
const torsoGeometry = buildTorsoGeometry();
const headGeometry = new THREE.SphereGeometry(0.125, 26, 20);
const hairGeometry = new THREE.SphereGeometry(0.136, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.63);
const faceGeometry = new THREE.PlaneGeometry(0.19, 0.19);
const signPlaneGeometry = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);
const signBackingGeometry = new THREE.BoxGeometry(SIGN_WIDTH + 0.045, SIGN_HEIGHT + 0.045, 0.025);
const stickGeometry = new THREE.CylinderGeometry(0.014, 0.018, 0.36, 5);

const skinMaterial = new THREE.MeshStandardMaterial({
  color: colors.personSkin,
  roughness: 0.8,
  emissive: colors.sunGlow,
  emissiveIntensity: 0,
});
const stickMaterial = new THREE.MeshStandardMaterial({ color: colors.stemDark, roughness: 0.9 });

export interface GreeterFigureHandle {
  apply: (local: GreeterLocal | null) => void;
}

interface GreeterFigureProps {
  /** Multiplicador de tamaño de la personita entera (1 = escritorio). */
  figureBoost?: number;
  /** Multiplicador extra SOLO del cartel (1 = escritorio): en pantallas
   * chicas el mensaje tiene que poder leerse a media distancia. */
  signBoost?: number;
}

// Borde superior máximo (en unidades locales de la figura) que puede
// alcanzar un cartel agrandado: por encima queda la barbilla, así que el
// cartel se baja en vez de subir cuando crece — nunca toca la cabeza.
const SIGN_TOP_LIMIT = 0.66;
const SIGN_HALF_HEIGHT = SIGN_HEIGHT / 2 + 0.0225;

/**
 * Una personita motivadora: geometría orgánica (torso tallado, cuello,
 * manos y pies propios, muchos más segmentos que antes en piernas/brazos/
 * cabeza) en vez del vocabulario "cápsula + esfera" original, que se leía
 * demasiado geométrico/tipo LEGO. Sigue siendo más pequeña que la
 * protagonista y sin ciclo de caminata — son parte fija del paisaje, nunca
 * avanzan. `apply()` es la única forma de reposicionarla o cambiarle la
 * pose/frase/color/cara: se llama SOLO cuando el tile que la contiene se
 * recicla (ver `Greeters.tsx`), nunca cuadro a cuadro.
 *
 * El cartel es un grupo hermano del cuerpo (no un hijo de ningún brazo):
 * `apply()` fija su posición/rotación una sola vez por pose y ninguna rama
 * de `useFrame` vuelve a tocarlas cuadro a cuadro — a propósito, para que
 * nunca se acerque ni se aleje de la cabeza mientras el resto del cuerpo
 * (brazos, piernas, torso) sigue animándose con total libertad.
 */
export const GreeterFigure = forwardRef<GreeterFigureHandle, GreeterFigureProps>(({ figureBoost = 1, signBoost = 1 }, ref) => {
  const groupRef = useRef<THREE.Group>(null);
  const armLeftRef = useRef<THREE.Group>(null);
  const armRightRef = useRef<THREE.Group>(null);
  const legLeftRef = useRef<THREE.Group>(null);
  const legRightRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const signGroupRef = useRef<THREE.Group>(null);
  const signGlowRef = useRef<THREE.SpriteMaterial>(null);

  const boostRef = useRef({ figure: figureBoost, sign: signBoost });
  useEffect(() => {
    boostRef.current = { figure: figureBoost, sign: signBoost };
  }, [figureBoost, signBoost]);

  const poseRef = useRef<{ pose: GreeterPose; cfg: PoseConfig; phase: number; rotationY: number; heightScale: number } | null>(
    null,
  );

  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: colors.greeterOutfits[0], roughness: 0.85 }), []);
  const legMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: colors.greeterOutfits[0], roughness: 0.9 }), []);
  const hairMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: colors.greeterHair[0], roughness: 0.85 }), []);
  const faceMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ map: GREETER_FACE_TEXTURES[0], roughness: 0.9, transparent: true, alphaTest: 0.4 }),
    [],
  );
  const signMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: GREETER_SIGN_TEXTURES[0],
        roughness: 0.85,
        emissive: new THREE.Color('#ffffff'),
        emissiveMap: GREETER_SIGN_TEXTURES[0],
        emissiveIntensity: 0,
      }),
    [],
  );

  useImperativeHandle(ref, () => ({
    apply(local) {
      const group = groupRef.current;
      if (!local) {
        if (group) group.visible = false;
        poseRef.current = null;
        return;
      }

      const cfg = POSE_TABLE[local.pose];
      poseRef.current = { pose: local.pose, cfg, phase: local.phase, rotationY: local.rotationY, heightScale: local.heightScale };

      if (group) {
        group.visible = true;
        group.position.set(local.x, 0, local.z);
        group.rotation.set(0, local.rotationY, cfg.lean);
        group.scale.setScalar(FIGURE_SCALE * boostRef.current.figure * local.heightScale);
      }

      const outfit = colors.greeterOutfits[local.outfitIndex];
      bodyMaterial.color.set(outfit);
      legMaterial.color.set(outfit).multiplyScalar(0.82);
      hairMaterial.color.set(colors.greeterHair[local.hairIndex]);
      faceMaterial.map = GREETER_FACE_TEXTURES[local.faceIndex];
      faceMaterial.needsUpdate = true;

      const signTexture = GREETER_SIGN_TEXTURES[local.phraseIndex];
      signMaterial.map = signTexture;
      signMaterial.emissiveMap = signTexture;
      signMaterial.needsUpdate = true;

      if (signGroupRef.current) {
        const signScale = boostRef.current.sign;
        signGroupRef.current.scale.setScalar(signScale);
        const [sx, sy, sz] = cfg.signPosition;
        // Agrandado, el cartel baja para que su borde superior nunca llegue
        // a la cabeza (ver `SIGN_TOP_LIMIT`); a escala 1 queda como siempre.
        const y = signScale > 1 ? Math.min(sy, SIGN_TOP_LIMIT - SIGN_HALF_HEIGHT * signScale) : sy;
        signGroupRef.current.position.set(sx, y, sz);
        // El pitch (x) lo fija la pose (cuánto se inclina hacia la cámara,
        // que suele estar más alta que el cartel); el yaw (y) es el sesgo
        // hacia la dirección de acercamiento calculado en
        // `generateTileGreeters.ts` — ninguno de los dos cambia con la
        // pose ni cuadro a cuadro, el cartel simplemente queda "mostrado".
        signGroupRef.current.rotation.set(cfg.signTilt, local.signYaw, 0);
      }
      if (legLeftRef.current) legLeftRef.current.rotation.z = cfg.legSpread;
      if (legRightRef.current) legRightRef.current.rotation.z = -cfg.legSpread;
    },
  }));

  useFrame((state) => {
    // Brillo nocturno cálido del cartel: compartido entre todas las
    // personitas vía `greeterNightState` (una sola lectura del ciclo
    // día/noche por cuadro, hecha en `Greeters.tsx`), así que esto es una
    // simple multiplicación, nunca un recálculo del ciclo por instancia.
    const night = greeterNightState.nightFactor;
    skinMaterial.emissiveIntensity = night * SKIN_NIGHT_GLOW;
    signMaterial.emissiveIntensity = night * SIGN_NIGHT_GLOW;
    if (signGlowRef.current) signGlowRef.current.opacity = night * SIGN_HALO_NIGHT_OPACITY;

    const group = groupRef.current;
    const cur = poseRef.current;
    if (!group || !group.visible || !cur) return;

    const t = state.clock.elapsedTime;
    const { pose, cfg, phase } = cur;
    let armLeftX = cfg.armLeft[0];
    let armLeftZ = cfg.armLeft[1];
    let armRightX = cfg.armRight[0];
    let armRightZ = cfg.armRight[1];
    let bodyY = 0;
    let legLeftX = 0;
    let legRightX = 0;
    let extraLean = 0;
    let extraTurn = 0;
    let scaleY = 1;
    let scaleXZ = 1;

    // Cada pose mueve brazos, piernas, torso Y postura juntos — nunca solo
    // el cartel o solo los brazos con el resto del cuerpo clavado. La
    // variedad entre personitas sale de combinar la pose (5 estilos de
    // movimiento bien distintos) con `phase` (desfasaje propio, para que
    // dos vecinas con la misma pose nunca se muevan al unísono).
    switch (pose) {
      case 'front': {
        // La más tranquila del grupo (contraste a propósito frente a las
        // demás, más enérgicas): un balanceo de peso suave que involucra el
        // torso entero. El cartel ya NO acompaña este vaivén con un
        // sube-y-baja propio — queda fijo en su posición, para que nunca
        // se acerque ni se aleje de la cabeza cuadro a cuadro.
        const sway = Math.sin(t * 1.1 + phase);
        armLeftZ += sway * 0.16;
        armRightZ -= sway * 0.16;
        extraLean = sway * 0.06;
        bodyY = Math.sin(t * 0.75 + phase) * 0.018;
        break;
      }
      case 'overhead': {
        // Estirarse hacia arriba una y otra vez: los brazos empujan hacia
        // el cielo mientras las piernas acompañan con una leve flexión de
        // rodillas en el momento bajo del ciclo, como tomando impulso cada
        // vez que vuelve a levantar el cartel.
        const reach = Math.sin(t * 1.15 + phase);
        armLeftX += reach * 0.16;
        armRightX += reach * 0.16;
        armLeftZ += reach * 0.12;
        armRightZ -= reach * 0.12;
        const crouch = Math.max(0, -reach);
        legLeftX = crouch * 0.32;
        legRightX = crouch * 0.32;
        bodyY = reach * 0.032 - crouch * 0.02;
        break;
      }
      case 'armsUp': {
        // Agitar los brazos alegremente, con todo el cuerpo metido en el
        // gesto: además del vaivén amplio y desfasado entre brazos, el
        // peso se traslada de una pierna a la otra y el torso acompaña
        // inclinándose apenas hacia el lado que agita más fuerte.
        const wave = Math.sin(t * 2.6 + phase);
        const waveR = Math.sin(t * 2.6 + phase + Math.PI * 0.35);
        armLeftZ += wave * 0.34;
        armRightZ -= waveR * 0.34;
        const shift = Math.sin(t * 1.3 + phase);
        legLeftX = shift * 0.16;
        legRightX = -shift * 0.16;
        extraLean = shift * 0.06;
        bodyY = Math.abs(wave) * 0.028;
        break;
      }
      case 'jump': {
        // Salto de verdad, no un simple trote: ambas piernas se flexionan
        // juntas antes de despegar y el cuerpo entero se comprime al tocar
        // el suelo y se estira apenas en lo más alto (squash & stretch),
        // para que el salto se sienta en el cuerpo completo y no solo en
        // la altura del grupo.
        const hop = Math.sin(t * 2.2 + phase);
        const rising = Math.max(0, hop);
        const crouch = Math.max(0, -hop);
        bodyY = rising * 0.1;
        legLeftX = crouch * 0.55 + rising * 0.12;
        legRightX = crouch * 0.55 + rising * 0.12;
        armLeftX -= rising * 0.1;
        armRightX -= rising * 0.1;
        armLeftZ += hop * 0.22;
        armRightZ -= hop * 0.22;
        scaleY = 1 - crouch * 0.07 + rising * 0.05;
        scaleXZ = 1 + crouch * 0.045 - rising * 0.03;
        break;
      }
      case 'celebrate': {
        // Festejo de cuerpo completo: un brazo bombea repetidas veces
        // mientras las piernas se mecen con la misma cadencia y el torso
        // gira y se inclina levemente, como si cambiara de postura sin
        // parar de festejar.
        const pump = Math.sin(t * 1.8 + phase);
        const bounce = Math.sin(t * 1.2 + phase);
        armLeftX += pump * 0.24;
        legLeftX = bounce * 0.16;
        legRightX = -bounce * 0.16;
        extraLean = Math.sin(t * 0.6 + phase) * 0.1;
        extraTurn = Math.sin(t * 0.5 + phase) * 0.06;
        bodyY = Math.abs(bounce) * 0.03;
        break;
      }
    }

    if (armLeftRef.current) {
      armLeftRef.current.rotation.x = armLeftX;
      armLeftRef.current.rotation.z = armLeftZ;
    }
    if (armRightRef.current) {
      armRightRef.current.rotation.x = armRightX;
      armRightRef.current.rotation.z = armRightZ;
    }
    if (legLeftRef.current) legLeftRef.current.rotation.x = legLeftX;
    if (legRightRef.current) legRightRef.current.rotation.x = legRightX;
    if (headRef.current) headRef.current.rotation.y = Math.sin(t * 0.3 + phase) * 0.2;

    group.position.y = bodyY;
    group.rotation.z = cfg.lean + extraLean;
    group.rotation.y = cur.rotationY + extraTurn;
    const h = cur.heightScale;
    const fs = FIGURE_SCALE * boostRef.current.figure;
    group.scale.set(fs * scaleXZ * h, fs * scaleY * h, fs * scaleXZ * h);
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Piernas, con un pie propio en la base */}
      <group ref={legLeftRef} position={[0.07, HIP_HEIGHT, 0]}>
        <mesh position={[0, -(HIP_HEIGHT - 0.1) / 2 - 0.05, 0]} geometry={legGeometry} material={legMaterial} castShadow />
        <mesh position={[0, -HIP_HEIGHT + 0.032, 0.022]} scale={[1.05, 0.6, 1.35]} geometry={footGeometry} material={legMaterial} castShadow />
      </group>
      <group ref={legRightRef} position={[-0.07, HIP_HEIGHT, 0]}>
        <mesh position={[0, -(HIP_HEIGHT - 0.1) / 2 - 0.05, 0]} geometry={legGeometry} material={legMaterial} castShadow />
        <mesh position={[0, -HIP_HEIGHT + 0.032, 0.022]} scale={[1.05, 0.6, 1.35]} geometry={footGeometry} material={legMaterial} castShadow />
      </group>

      {/* Torso tallado (cintura → hombros) */}
      <mesh position={[0, HIP_HEIGHT, 0]} geometry={torsoGeometry} material={bodyMaterial} castShadow />

      {/* Cuello: sin esto, la cabeza quedaba pegada directo al torso — el
          principal culpable de la sensación de "figura de bloques". */}
      <mesh position={[0, NECK_Y, 0]} geometry={neckGeometry} material={skinMaterial} castShadow />

      {/* Cabeza */}
      <group ref={headRef} position={[0, HEAD_Y, 0]}>
        <mesh geometry={headGeometry} material={skinMaterial} castShadow />
        <mesh position={[0, 0.05, -0.012]} geometry={hairGeometry} material={hairMaterial} castShadow />
        {/* Carita: una "calcomanía" plana pegada justo al frente de la
            cabeza (mismo lado que el cartel), con sonrisa y sonrojo. */}
        <mesh position={[0, -0.01, 0.135]} geometry={faceGeometry} material={faceMaterial} />
      </group>

      {/* Brazos, con una mano propia en la punta */}
      <group ref={armLeftRef} position={[0.135, SHOULDER_Y, 0]}>
        <mesh position={[0, -0.1, 0]} geometry={armGeometry} material={skinMaterial} castShadow />
        <mesh position={[0, -0.21, 0]} geometry={handGeometry} material={skinMaterial} castShadow />
      </group>
      <group ref={armRightRef} position={[-0.135, SHOULDER_Y, 0]}>
        <mesh position={[0, -0.1, 0]} geometry={armGeometry} material={skinMaterial} castShadow />
        <mesh position={[0, -0.21, 0]} geometry={handGeometry} material={skinMaterial} castShadow />
      </group>

      {/* Cartel: tabla + tarjeta con el texto de la frase, más un mango
          corto que lo conecta visualmente hacia el cuerpo, y un halo
          aditivo detrás que solo se enciende de noche. Su posición y leve
          inclinación las fija `apply()` según la pose. */}
      <group ref={signGroupRef}>
        <sprite scale={[0.85, 0.68, 1]} position={[0, 0, -0.03]}>
          <spriteMaterial
            ref={signGlowRef}
            map={GREETER_SIGN_GLOW_TEXTURE}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
        <mesh geometry={stickGeometry} material={stickMaterial} position={[0, -0.2, 0]} castShadow />
        <mesh geometry={signBackingGeometry} castShadow>
          <meshStandardMaterial color={colors.roadEdge} roughness={0.9} />
        </mesh>
        <mesh geometry={signPlaneGeometry} material={signMaterial} position={[0, 0, 0.032]} />
      </group>
    </group>
  );
});

GreeterFigure.displayName = 'GreeterFigure';
