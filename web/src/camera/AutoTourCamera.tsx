import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { MathUtils, PerspectiveCamera, Vector3, type Group } from 'three';
import {
  AUTO_TOUR_FIRST_FLIGHT, AUTO_TOUR_LANDING, AUTO_TOUR_NEST, AUTO_TOUR_RETURN, autoTourPosition,
} from '../features/tour/autoTour';
import { AUTO_TOUR_HIGHLIGHTS, AUTO_TOUR_LENGTH, autoTourFrame, frameHighlight, highlightView } from '../features/tour/autoTourHighlights';
import { EagleNest, TourEagle, type EaglePose } from '../scene/tour/TourEagle';
import { useCampusStore } from '../store/useCampusStore';
import { useTourStore } from '../store/useTourStore';

const up = new Vector3(0, 1, 0);
const startFocus = new Vector3(AUTO_TOUR_NEST[0] + 1, AUTO_TOUR_NEST[1] + 1.82, AUTO_TOUR_NEST[2] - 0.5);
const panoramaFocus = new Vector3(0, 10, 111);
const normalFov = 49;
// Fade each landmark into the chase camera as the eagle reaches its approach.
const landmarkShots = [
  { timing: [16, 17.5, 21.5, 24], point: new Vector3(-108, 5, -199), weight: 0.39 }, // 정문
  { timing: [30, 32, 34.5, 36.8], point: new Vector3(-46, 22, -81), weight: 0.44 }, // 대학원관
  { timing: [35.8, 37.8, 39.3, 41.6], point: new Vector3(-39, 22, -49), weight: 0.43 }, // 디자인관
  { timing: [40.5, 42, 45, 47.3], point: new Vector3(-32, 19, -14), weight: 0.44 }, // GEMI관
  { timing: [49.5, 51.8, 55, 57.9], point: new Vector3(9, 14, 20), weight: 0.44 }, // 음악관
  { timing: [58.1, 60.7, 65.2, 67.7], point: new Vector3(-6, 21, 149), weight: 0.64 }, // 영산비전센터
  { timing: [76.5, 79.6, 84.4, 87], point: new Vector3(45, 14, 121), weight: 0.53 }, // 로뎀관
  { timing: [86.2, 88.5, 90.5, 93], point: new Vector3(88, 17, 185), weight: 0.46 }, // 학생회관
  { timing: [92.1, 93.7, 95.1, 96.4], point: new Vector3(51, 21, 231), weight: 0.51 }, // 신학관
  { timing: [95.6, 96.8, 98.9, 100.7], point: new Vector3(33, 18, 189), weight: 0.47 }, // 이공관
  { timing: [99.7, 101.5, 104.8, 108.1], point: new Vector3(12, 21, 254), weight: 0.56 }, // 비전관
  { timing: [114.2, 116.7, 118.9, 121.5], point: new Vector3(45, 14, 126), weight: 0.45 }, // 로뎀관 복귀
  { timing: [132.7, 135.8, 140.5, 142.6], point: new Vector3(8, 8, -76), weight: 0.24 }, // 운동장
  { timing: [141.8, 144.5, 149.8, 152.6], point: new Vector3(-43, 16, -182), weight: 0.42 }, // 본관
] as const;

export function AutoTourCamera() {
  const camera = useThree(state => state.camera);
  const buildings = useCampusStore(state => state.campus?.buildings);
  const highlights = useMemo(() => new Map(AUTO_TOUR_HIGHLIGHTS.flatMap(shot => {
    const building = buildings?.find(building => building.id === shot.id);
    return building ? [[shot.id, highlightView(shot, building)] as const] : [];
  })), [buildings]);
  const eagles = useRef<Group>(null);
  const playback = useRef({ run: -1, time: 0 });
  const pose = useRef<EaglePose>({ time: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 });
  const vectors = useMemo(() => ({
    bird: new Vector3(), before: new Vector3(), next: new Vector3(),
    facing: new Vector3(), incoming: new Vector3(), outgoing: new Vector3(),
    towardBird: new Vector3(), right: new Vector3(), frameUp: new Vector3(), target: new Vector3(), focus: new Vector3(),
  }), []);

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const { fov, near } = camera;
    camera.fov = normalFov;
    camera.near = 0.12;
    camera.updateProjectionMatrix();
    return () => {
      camera.fov = fov;
      camera.near = near;
      camera.updateProjectionMatrix();
    };
  }, [camera]);

  useEffect(() => {
    const pauseOnHide = () => {
      const { auto, toggleAutoPause } = useTourStore.getState();
      if (document.hidden && auto?.phase === 'playing') toggleAutoPause();
    };
    document.addEventListener('visibilitychange', pauseOnHide);
    return () => document.removeEventListener('visibilitychange', pauseOnHide);
  }, []);

  useFrame((_, delta) => {
    const { auto, updateAutoTime } = useTourStore.getState();
    if (!auto) return;
    if (playback.current.run !== auto.run) playback.current = { run: auto.run, time: 0 };
    if (auto.phase === 'playing' && !document.hidden) {
      playback.current.time = Math.min(AUTO_TOUR_LENGTH, playback.current.time + Math.min(delta, 0.2));
    }
    const elapsed = playback.current.time;
    const { routeTime: time, highlight, progress } = autoTourFrame(elapsed);
    const view = highlight && highlights.get(highlight.id);
    const { bird, before, next, facing, incoming, outgoing, towardBird, right, frameUp, target, focus } = vectors;
    const showingBuilding = !!view && camera instanceof PerspectiveCamera;
    if (eagles.current) eagles.current.visible = !showingBuilding;
    if (view && camera instanceof PerspectiveCamera) {
      frameHighlight(camera, view, progress, focus);
      updateAutoTime(auto.run, elapsed);
      return;
    }
    autoTourPosition(time, 1, bird);
    autoTourPosition(time, 2, camera.position);

    autoTourPosition(time - 0.4, 1, before);
    autoTourPosition(time + 0.4, 1, next);
    facing.subVectors(next, before);
    incoming.subVectors(bird, before).normalize();
    outgoing.subVectors(next, bird).normalize();
    const flying = time >= AUTO_TOUR_FIRST_FLIGHT && time < AUTO_TOUR_LANDING;
    const takeoff = MathUtils.smoothstep(time, 7.5, 10.1);
    const landed = MathUtils.smoothstep(time, AUTO_TOUR_LANDING - 1.2, AUTO_TOUR_LANDING);
    const pitch = -Math.atan2(facing.y, Math.hypot(facing.x, facing.z));
    const bank = Math.atan2(incoming.z * outgoing.x - incoming.x * outgoing.z, incoming.x * outgoing.x + incoming.z * outgoing.z);
    const wobble = (1 - MathUtils.smoothstep(time, 10, 18)) * Math.sin(time * 6) * 0.14;
    const yaw = Math.atan2(facing.x, facing.z);
    const roofYaw = -0.93;
    const changeYaw = Math.atan2(Math.sin(yaw - roofYaw), Math.cos(yaw - roofYaw));
    Object.assign(pose.current, {
      time, x: bird.x, y: bird.y, z: bird.z,
      yaw: roofYaw + changeYaw * takeoff * (1 - landed),
      pitch: flying ? MathUtils.clamp(pitch * 0.63, -0.46, 0.51) * (1 - landed) : 0,
      roll: flying ? (MathUtils.clamp(-bank * 1.65, -0.43, 0.43) + wobble) * (1 - landed) : 0,
    });

    towardBird.subVectors(bird, camera.position).normalize();
    right.crossVectors(towardBird, up).normalize();
    frameUp.crossVectors(right, towardBird).normalize();
    const aspect = camera instanceof PerspectiveCamera ? camera.aspect : 1.78;
    const mainReveal = MathUtils.smoothstep(time, 150, 152.7) * (1 - MathUtils.smoothstep(time, 154.5, 156));
    const { panorama, dive, pullOut } = AUTO_TOUR_RETURN;
    const wideShot = MathUtils.smoothstep(time, panorama - 2.4, panorama + 0.5) * (1 - MathUtils.smoothstep(time, dive - 0.3, dive + 2.5));
    const diving = MathUtils.smoothstep(time, dive, dive + 2.8) * (1 - MathUtils.smoothstep(time, pullOut - 1.6, pullOut + 0.8));
    const rightOffset = 0.086 * Math.min(1, aspect / 1.45);
    const distance = bird.distanceTo(camera.position);
    target.copy(bird).addScaledVector(right, -distance * rightOffset)
      .addScaledVector(frameUp, distance * (0.135 - 0.35 * mainReveal - 0.13 * diving));

    // Blend directions at the same distance so a distant building doesn't pull the camera abruptly.
    let landmarkFraming = 0;
    for (const { timing: [start, shown, hold, end], point, weight } of landmarkShots) {
      if (time <= start || time >= end) continue;
      const blend = MathUtils.smoothstep(time, start, shown) * (1 - MathUtils.smoothstep(time, hold, end));
      target.lerp(focus.copy(point).sub(camera.position).setLength(distance).add(camera.position), blend * weight);
      landmarkFraming = Math.max(landmarkFraming, blend);
    }
    if (diving > 0) {
      autoTourPosition(time + 1.15, 1, focus).sub(camera.position).setLength(distance).add(camera.position);
      target.lerp(focus, diving * 0.23);
    }
    target.lerp(focus.copy(panoramaFocus).sub(camera.position).setLength(distance).add(camera.position), wideShot);

    if (camera instanceof PerspectiveCamera) {
      const fov = normalFov + Math.max(20 * wideShot, 8.4 * diving, 7 * landmarkFraming);
      if (Math.abs(camera.fov - fov) > 0.002) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    const roofShot = Math.max(1 - MathUtils.smoothstep(time, 7.3, 11.8), landed);
    camera.lookAt(target.lerp(startFocus, roofShot));
    updateAutoTime(auto.run, elapsed);
  }, -2);

  return <>
    <EagleNest pose={pose} />
    <group ref={eagles}>
      <TourEagle pose={pose} />
      <TourEagle pose={pose} companion />
    </group>
  </>;
}
