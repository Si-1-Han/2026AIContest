import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { birdTourFor, type BirdPose } from '../features/tour/birdTour';
import { BirdWings, type BirdWingsHandle } from '../scene/tour/BirdWings';
import { useCampusStore } from '../store/useCampusStore';
import { birdClock, useBirdTourStore } from '../store/useBirdTourStore';

/** 새의 시점 자동 투어 카메라. 비행 경로·날갯짓은 birdTour의 시간 함수가 정한다. */
export function BirdCamera() {
  const camera = useThree(s => s.camera);
  const campus = useCampusStore(s => s.campus)!;
  const tour = useMemo(() => birdTourFor(campus), [campus]);
  const wings = useRef<BirdWingsHandle>(null);
  const pose = useMemo<BirdPose>(() => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), flap: 0, wingPhase: 0, phase: 'perch', caption: null }), []);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const { fov, near } = camera;
    camera.fov = 66; camera.near = 0.06; camera.updateProjectionMatrix();
    return () => { camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); };
  }, [camera]);

  useEffect(() => {
    useBirdTourStore.getState().reset(tour.duration);
    // 발표 리허설·검증용: ?bird=초 로 원하는 장면에서 멈춰 시작
    const at = Number(new URLSearchParams(window.location.search).get('bird'));
    if (Number.isFinite(at) && at > 0) { useBirdTourStore.getState().seek(at); useBirdTourStore.getState().pause(); }
  }, [tour]);

  useFrame((_, delta) => {
    const store = useBirdTourStore.getState();
    if (store.playing) {
      birdClock.t = Math.min(tour.duration, birdClock.t + Math.min(delta, 0.1));
      if (birdClock.t >= tour.duration) store.pause();
    }
    tour.pose(birdClock.t, pose);
    camera.position.copy(pose.position);
    camera.quaternion.copy(pose.quaternion);
    camera.updateMatrixWorld();
    const airborne = pose.phase !== 'perch' && pose.phase !== 'turn' && pose.phase !== 'done' || pose.flap > 0.05;
    wings.current?.update(camera, pose.flap, pose.wingPhase, airborne);
    store.report(birdClock.t, pose.caption);
  });

  return <BirdWings ref={wings} />;
}
