import { Canvas } from '@react-three/fiber';
import { CameraDirector, INITIAL_CAMERA } from '../camera/CameraDirector';
import { COLORS } from '../config';
import { useCampusStore } from '../store/useCampusStore';
import { Buildings } from './Buildings';
import { ContextBuildings } from './ContextBuildings';
import { Effects } from './Effects';
import { EndpointPins } from './EndpointPins';
import { Ground } from './Ground';
import { Paths } from './Paths';
import { RoomLayer } from './RoomLayer';
import { RouteLine } from './RouteLine';

export function CampusScene() {
  // 빈 곳 클릭: 강의실 선택 해제 → (층 분해 보기에서만) 건물 선택 해제. 층 보기는 뒤로 버튼으로 나간다.
  const onMissed = () => {
    const s = useCampusStore.getState();
    if (s.selectedRoomId) s.selectRoom(null);
    else if (s.floorIndex === null) s.select(null);
  };

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: INITIAL_CAMERA.position, fov: 38, near: 1, far: 6000 }}
      onPointerMissed={onMissed}
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
      <RoomLayer />
      <RouteLine />
      <EndpointPins />

      <CameraDirector />
      <Effects />
    </Canvas>
  );
}
