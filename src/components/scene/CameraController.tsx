import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollState } from '../story/scrollContext';
import { CHARACTER_Z } from '../../lib/walk';
import { damp } from '../../lib/random';
import { getCycleProgress, getSkyState, createSkyState } from '../../lib/dayNightCycle';
import { TIER_SETTINGS, type ViewportTier } from '../../lib/viewport';

interface CameraControllerProps {
  tier: ViewportTier;
}

/**
 * Cámara cinematográfica centrada: sigue a la persona y al Pug desde
 * detrás y ligeramente arriba, sin deriva lateral (la composición nunca
 * se descompensa hacia un costado). Tiene una variación sutil ligada al
 * ciclo día/noche (un poco más alta y alejada de noche, para una vista
 * más contemplativa) y un balanceo suave e imperceptible para que nunca
 * se sienta estática.
 */
export function CameraController({ tier }: CameraControllerProps) {
  const { camera } = useThree();
  const scrollState = useScrollState();
  const settings = TIER_SETTINGS[tier];

  const targetPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const currentLookAt = useRef(new THREE.Vector3(0, 1.2, 0));
  const skyState = useRef(createSkyState()).current;

  useFrame((state, delta) => {
    const distance = scrollState.current.smoothDistance;
    getSkyState(getCycleProgress(distance), skyState);

    const scale = settings.cameraDistanceScale;
    const breathe = Math.sin(state.clock.elapsedTime * 0.1) * 0.18;

    const height = (2.15 + skyState.nightFactor * 0.75) * scale;
    const back = (6.4 + skyState.nightFactor * 1.5) * scale;

    targetPos.current.set(breathe * 0.35, height, CHARACTER_Z + back);
    targetLookAt.current.set(breathe * 0.18, 1.15, CHARACTER_Z - 2.6);

    camera.position.x = damp(camera.position.x, targetPos.current.x, 2, delta);
    camera.position.y = damp(camera.position.y, targetPos.current.y, 2, delta);
    camera.position.z = damp(camera.position.z, targetPos.current.z, 2, delta);

    currentLookAt.current.x = damp(currentLookAt.current.x, targetLookAt.current.x, 2.4, delta);
    currentLookAt.current.y = damp(currentLookAt.current.y, targetLookAt.current.y, 2.4, delta);
    currentLookAt.current.z = damp(currentLookAt.current.z, targetLookAt.current.z, 2.4, delta);
    camera.lookAt(currentLookAt.current);

    const persp = camera as THREE.PerspectiveCamera;
    if (persp.fov !== settings.fov) {
      persp.fov = settings.fov;
      persp.updateProjectionMatrix();
    }
  });

  return null;
}
