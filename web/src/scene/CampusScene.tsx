import { Canvas } from '@react-three/fiber';
import { CameraDirector, INITIAL_CAMERA } from '../camera/CameraDirector';
import { COLORS } from '../config';
import { useCampusStore } from '../store/useCampusStore';
import { Buildings } from './Buildings';
import { ContextBuildings } from './ContextBuildings';
import { Effects } from './Effects';
import { Ground } from './Ground';
import { Paths } from './Paths';
import { RouteLine } from './RouteLine';

export function CampusScene() {
  const select = useCampusStore((s) => s.select);

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: INITIAL_CAMERA.position, fov: 38, near: 1, far: 6000 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={[COLORS.background]} />
      <fog attach="fog" args={[COLORS.background, 650, 1700]} />

      <hemisphereLight args={['#c8dcff', '#141c30', 0.9]} />
      <directionalLight
        castShadow
        position={[-220, 320, 160]}
        intensity={2.2}
        color="#fff3e0"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-400}
        shadow-camera-right={400}
        shadow-camera-top={400}
        shadow-camera-bottom={-400}
        shadow-camera-far={1200}
        shadow-bias={-0.0005}
      />

      <Ground />
      <ContextBuildings />
      <Paths />
      <Buildings />
      <RouteLine />

      <CameraDirector />
      <Effects />
    </Canvas>
  );
}
