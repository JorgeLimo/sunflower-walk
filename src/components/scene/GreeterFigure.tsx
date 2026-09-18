import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
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
// abajo.
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
    signPosition: [0, 0.93, 0.1],
    signTilt: -0.32,
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

const legGeometry = new THREE.CapsuleGeometry(0.052, HIP_HEIGHT - 0.09, 4, 6);
const armGeometry = new THREE.CapsuleGeometry(0.048, 0.24, 4, 6);
const torsoGeometry = new THREE.CapsuleGeometry(0.115, 0.28, 4, 8);
const headGeometry = new THREE.SphereGeometry(0.135, 14, 14);
const hairGeometry = new THREE.SphereGeometry(0.144, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
const faceGeometry = new THREE.PlaneGeometry(0.2, 0.2);
const signPlaneGeometry = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);
const signBackingGeometry = new THREE.BoxGeometry(SIGN_WIDTH + 0.045, SIGN_HEIGHT + 0.045, 0.025);
const stickGeometry = new THREE.CylinderGeometry(0.014, 0.018, 0.36, 5);

const skinMaterial = new THREE.MeshStandardMaterial({
  color: colors.personSkin,
  roughness: 0.8,
  emissive: colors.sunGlow,
  emissiveIntensity: 0,
});
const hairMaterial = new THREE.MeshStandardMaterial({ color: colors.personHair, roughness: 0.9 });
const stickMaterial = new THREE.MeshStandardMaterial({ color: colors.stemDark, roughness: 0.9 });

export interface GreeterFigureHandle {
  apply: (local: GreeterLocal | null) => void;
}

/**
 * Una personita motivadora: geometría simple (cápsulas + esferas), mismo
 * vocabulario visual que `Person.tsx` pero más pequeña y sin ciclo de
 * caminata — son parte fija del paisaje, nunca avanzan. `apply()` es la
 * única forma de reposicionarla o cambiarle la pose/frase/color/cara: se
 * llama SOLO cuando el tile que la contiene se recicla (ver `Greeters.tsx`),
 * nunca cuadro a cuadro.
 *
 * El movimiento SÍ corre todos los cuadros (useFrame), pero solo mientras
 * el grupo está visible: cada pose tiene su propia animación (agitar los
 * brazos, saltitos con piernas, balanceo, etc.) para que ninguna se sienta
 * "flotando" sin vida — ver el switch dentro de useFrame.
 */
export const GreeterFigure = forwardRef<GreeterFigureHandle>((_props, ref) => {
  const groupRef = useRef<THREE.Group>(null);
  const armLeftRef = useRef<THREE.Group>(null);
  const armRightRef = useRef<THREE.Group>(null);
  const legLeftRef = useRef<THREE.Group>(null);
  const legRightRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const signGroupRef = useRef<THREE.Group>(null);
  const signGlowRef = useRef<THREE.SpriteMaterial>(null);

  const poseRef = useRef<{ pose: GreeterPose; cfg: PoseConfig; phase: number; rotationY: number } | null>(null);

  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: colors.greeterOutfits[0], roughness: 0.85 }), []);
  const legMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: colors.greeterOutfits[0], roughness: 0.9 }), []);
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
      poseRef.current = { pose: local.pose, cfg, phase: local.phase, rotationY: local.rotationY };

      if (group) {
        group.visible = true;
        group.position.set(local.x, 0, local.z);
        group.rotation.set(0, local.rotationY, cfg.lean);
        group.scale.setScalar(FIGURE_SCALE);
      }

      const outfit = colors.greeterOutfits[local.outfitIndex];
      bodyMaterial.color.set(outfit);
      legMaterial.color.set(outfit).multiplyScalar(0.82);
      faceMaterial.map = GREETER_FACE_TEXTURES[local.faceIndex];
      faceMaterial.needsUpdate = true;

      const signTexture = GREETER_SIGN_TEXTURES[local.phraseIndex];
      signMaterial.map = signTexture;
      signMaterial.emissiveMap = signTexture;
      signMaterial.needsUpdate = true;

      if (signGroupRef.current) {
        signGroupRef.current.position.set(...cfg.signPosition);
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
    let signBobY = 0;
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
        // torso entero, más el gesto de levantar el cartel un poco y
        // volver a bajarlo — un movimiento propio del cartel, distinto del
        // vaivén del cuerpo.
        const sway = Math.sin(t * 1.1 + phase);
        armLeftZ += sway * 0.16;
        armRightZ -= sway * 0.16;
        extraLean = sway * 0.06;
        bodyY = Math.sin(t * 0.75 + phase) * 0.018;
        signBobY = Math.sin(t * 0.85 + phase * 1.3) * 0.045;
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
    if (signGroupRef.current && signBobY !== 0) {
      signGroupRef.current.position.y = cfg.signPosition[1] + signBobY;
    }

    group.position.y = bodyY;
    group.rotation.z = cfg.lean + extraLean;
    group.rotation.y = cur.rotationY + extraTurn;
    group.scale.set(FIGURE_SCALE * scaleXZ, FIGURE_SCALE * scaleY, FIGURE_SCALE * scaleXZ);
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Piernas */}
      <group ref={legLeftRef} position={[0.075, HIP_HEIGHT, 0]}>
        <mesh position={[0, -(HIP_HEIGHT - 0.09) / 2 - 0.045, 0]} geometry={legGeometry} material={legMaterial} castShadow />
      </group>
      <group ref={legRightRef} position={[-0.075, HIP_HEIGHT, 0]}>
        <mesh position={[0, -(HIP_HEIGHT - 0.09) / 2 - 0.045, 0]} geometry={legGeometry} material={legMaterial} castShadow />
      </group>

      {/* Torso */}
      <mesh position={[0, 0.52, 0]} geometry={torsoGeometry} material={bodyMaterial} castShadow />

      {/* Cabeza */}
      <group ref={headRef} position={[0, 0.71, 0]}>
        <mesh geometry={headGeometry} material={skinMaterial} castShadow />
        <mesh position={[0, 0.06, -0.015]} geometry={hairGeometry} material={hairMaterial} castShadow />
        {/* Carita: una "calcomanía" plana pegada justo al frente de la
            cabeza (mismo lado que el cartel), con sonrisa y sonrojo. */}
        <mesh position={[0, -0.01, 0.145]} geometry={faceGeometry} material={faceMaterial} />
      </group>

      {/* Brazos */}
      <group ref={armLeftRef} position={[0.155, 0.62, 0]}>
        <mesh position={[0, -0.12, 0]} geometry={armGeometry} material={skinMaterial} castShadow />
      </group>
      <group ref={armRightRef} position={[-0.155, 0.62, 0]}>
        <mesh position={[0, -0.12, 0]} geometry={armGeometry} material={skinMaterial} castShadow />
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
        <mesh geometry={signPlaneGeometry} material={signMaterial} position={[0, 0, 0.017]} />
      </group>
    </group>
  );
});

GreeterFigure.displayName = 'GreeterFigure';
