import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeContext } from '../../lib/geometry';
import { useCampusStore } from '../../store/useCampusStore';
import { useTourStore } from '../../store/useTourStore';
import { Batch, type Part } from './Batch';
import { makeScenery } from './scenery';
import { TourBuildings } from './TourBuildings';
import { GateApproach } from './GateApproach';
import { buildRoadLayout, groundSurfaceMask, tourContext } from './roadLayout';
import { TourRoads, useGroundTexture } from './TourRoads';
import { Trees } from './Trees';
import { BuildingNames } from './BuildingNames';
import { TourEnvironment, TourEffects, TourSky } from './TourLighting';
import { VisionTerrace } from './VisionTerrace';
import { FountainCourt } from './FountainCourt';
import { CampusFountain } from './CampusFountain';
import { MainGrounds } from './MainGrounds';
import { RoadDrains } from './RoadDrains';
import { BuildingPads } from './BuildingPads';
import { ScienceGarden } from './ScienceGarden';
import { GuardBooth } from './GuardBooth';
import { ParkedCars } from './ParkedCars';
import { tourElevation } from '../../features/tour/terrain';
import { campusTerrain } from './terrainGeometry';

function TourSun() {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ camera }) => {
    target.position.set(camera.position.x, camera.position.y - 1.8, camera.position.z); target.updateMatrixWorld();
    light.current?.position.set(camera.position.x - 70, camera.position.y + 110, camera.position.z - 45);
  });
  return <><primitive object={target} /><directionalLight ref={light} target={target} intensity={2.8} color="#fff2d9" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={70} shadow-camera-bottom={-70} shadow-camera-far={300} shadow-radius={2.5} shadow-bias={-0.0001} shadow-normalBias={0.035} /></>;
}

export function TourWorld() {
  const campus = useCampusStore(s => s.campus)!;
  const network = useTourStore(s => s.network)!;
  const showBuildingNames = useTourStore(s => s.view !== 'auto');
  const layout = useMemo(() => buildRoadLayout(campus, network.corridors), [campus, network.corridors]);
  const scenery = useMemo(() => makeScenery(campus, layout), [campus, layout]);
  const groundMask = useMemo(() => groundSurfaceMask(layout), [layout]);
  const grass = useGroundTexture('grass');
  const ground = useMemo(() => campusTerrain(campus, groundMask), [campus, layout]);
  const elevation = tourElevation(campus);
  const context = useMemo(() => {
    const geometry = mergeContext(tourContext(campus, layout).filter(b => Math.hypot(b.footprint[0]![0], b.footprint[0]![1]) < 620));
    if (geometry) { const p = geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + elevation(p.getX(i), p.getZ(i))); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); }
    return geometry;
  }, [campus, layout, elevation]);
  useEffect(() => () => { ground.dispose(); context?.dispose(); }, [ground, context]);
  const clouds = useMemo<Part[]>(() => Array.from({ length: 18 }, (_, i) => Array.from({ length: 5 }, (_, j): Part => ({ p: [Math.sin(i * 3.3) * 650 + (j - 2) * 12, 140 + i % 4 * 14 + Math.sin(j * 1.7) * 5, Math.cos(i * 2.4) * 650 + Math.cos(j * 2) * 7], s: [17 + j % 3 * 5, 8 + j % 3 * 3, 13 + j % 2 * 6], color: '#fffef6' }))).flat(), []);
  return <>
    <color attach="background" args={['#3288de']} /><fog attach="fog" args={['#83b2d9', 500, 1700]} />
    <TourSky />
    <hemisphereLight args={['#d4e6ff', '#b6b1a2', 0.65]} />
    <TourSun />
    <TourEnvironment />
    <mesh rotation-x={-Math.PI / 2} position-y={-30} receiveShadow><planeGeometry args={[8000, 8000]} /><meshStandardMaterial color="#89ac73" /></mesh>
    <mesh geometry={ground} receiveShadow><meshStandardMaterial color="#79a950" map={grass} roughness={1} /></mesh>
    {context && <mesh geometry={context} castShadow receiveShadow><meshStandardMaterial color="#d1d7cc" roughness={0.95} /></mesh>}
    <TourRoads layout={layout} />
    <ParkedCars bays={layout.bays} elevation={elevation} />
    <FountainCourt campus={campus} pavement={groundMask} />
    <BuildingPads campus={campus} />
    <ScienceGarden campus={campus} pavement={groundMask} />
    <VisionTerrace /><GuardBooth />
    <MainGrounds roadMask={layout.asphalt} pavementMask={groundMask} />
    <Batch parts={clouds} shape="sphere" unlit />
    <Batch parts={scenery.paving} shadow={false} /><Batch parts={scenery.paint} shadow={false} />
    {scenery.fieldCircleCenters.map(center => (
      <mesh key={`${center[0]},${center[2]}`} position={center} rotation-x={-Math.PI / 2} receiveShadow>
        <ringGeometry args={[6.94, 7.06, 128]} />
        <meshStandardMaterial color="#f0efe1" roughness={0.88} />
      </mesh>
    ))}
    <Batch parts={scenery.stone} /><Batch parts={scenery.trunks} shape="cylinder" /><Batch parts={scenery.leaves} shape="sphere" />
    <Batch parts={scenery.metal} metal shadow={false} />
    <RoadDrains parts={scenery.drains} />
    <Trees trees={scenery.trees} />
    <TourBuildings campus={campus} />{showBuildingNames && <BuildingNames campus={campus} />}<CampusFountain /><GateApproach />
    <TourEffects />
  </>;
}
