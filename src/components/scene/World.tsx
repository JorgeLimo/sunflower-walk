import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Environment } from './Environment';
import { Terrain } from './Terrain';
import { Road } from './Road';
import { Sun } from './Sun';
import { Moon } from './Moon';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';
import { Birds } from './Birds';
import { Clouds } from './Clouds';
import { Sunflowers } from './Sunflowers';
import { Vegetation } from './Vegetation';
import { Person } from './Person';
import { Pug } from './Pug';
import { Cat } from './Cat';
import { CameraController } from './CameraController';
import { ScrollPhysics } from '../story/ScrollPhysics';
import { useViewportTier, TIER_SETTINGS } from '../../lib/viewport';

/**
 * Raíz del mundo 3D: un único <Canvas> con cámara en perspectiva real.
 * Cada elemento de la escena es un componente independiente. La densidad
 * de girasoles, partículas, estrellas, resolución de sombras y FOV se
 * ajustan según el tier de viewport (mobile/tablet/desktop).
 */
export function World() {
  const tier = useViewportTier();
  const settings = TIER_SETTINGS[tier];

  return (
    <Canvas
      shadows
      dpr={settings.dpr}
      gl={{ antialias: true }}
      camera={{ position: [0, 2.1, 6.4], fov: settings.fov, near: 0.1, far: 300 }}
    >
      <ScrollPhysics />
      <Environment shadowMapSize={settings.shadowMapSize} />
      <Sun />
      <Moon />
      <Stars count={settings.starCount} />
      <ShootingStars />
      {settings.enableBirds && <Birds />}
      <Clouds count={tier === 'mobile' ? 4 : 6} />
      <Terrain />
      <Road />
      <Sunflowers counts={settings.sunflowersPerTile} />
      <Vegetation counts={settings.vegetationPerTile} />
      <Person />
      <Pug />
      <Cat />
      <CameraController tier={tier} />

      {settings.enableBloom && (
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.7} luminanceSmoothing={0.3} intensity={0.4} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  );
}
