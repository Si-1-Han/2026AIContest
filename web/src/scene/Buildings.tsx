import { Edges, Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COLORS } from '../config';
import { extrudeFootprint } from '../lib/geometry';
import { useCampusStore } from '../store/useCampusStore';
import type { Building, FloorInfo } from '../types/generated/campus';
import { bounds, explodedBase, floorPose, totalHeight, type ViewMode } from './layout';

/** 건물이 땅에서 솟아오르는 등장 연출 (인트로 1차 버전) */
const RISE_DELAY = 0.6;
const RISE_STAGGER = 0.07;
const RISE_SPEED = 2.2;
/** 층 이동·투명도 전환 속도 */
const EASE = 6;
const NO_RAYCAST = () => undefined;

export function Buildings() {
  const buildings = useCampusStore((s) => s.campus?.buildings);
  if (!buildings) return null;
  return (
    <group>
      {buildings.map((b, i) => (
        <BuildingMesh key={b.id} building={b} order={i} />
      ))}
    </group>
  );
}

function useViewMode(building: Building): { mode: ViewMode; dimmed: boolean } {
  const selectedId = useCampusStore((s) => s.selectedId);
  const floorIndex = useCampusStore((s) => s.floorIndex);
  const selected = selectedId === building.id;
  if (!selected) return { mode: { kind: 'campus' }, dimmed: selectedId !== null };
  if (floorIndex === null || !building.floors.length) return { mode: { kind: 'building' }, dimmed: false };
  return { mode: { kind: 'floor', index: floorIndex }, dimmed: false };
}

function BuildingMesh({ building, order }: { building: Building; order: number }) {
  const { mode, dimmed } = useViewMode(building);
  const hovered = useCampusStore((s) => s.hoveredId === building.id);
  const selected = mode.kind !== 'campus';

  // 인트로: 땅에서 솟아오르기
  const group = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (!group.current || group.current.scale.y >= 1) return;
    elapsed.current += delta;
    const t = Math.max(0, elapsed.current - RISE_DELAY - order * RISE_STAGGER) * RISE_SPEED;
    const eased = 1 - Math.pow(1 - Math.min(t, 1), 3);
    group.current.scale.y = Math.max(eased, 0.0001);
  });

  const top = building.floors.length
    ? explodedBase(building, building.floors.length) + 6
    : totalHeight(building) + 6;
  const labelY = mode.kind === 'campus' ? totalHeight(building) + 6 : top;

  return (
    <group ref={group} scale-y={0.0001}>
      {building.floors.length ? (
        building.floors.map((f) => (
          <FloorSlab
            key={f.index}
            building={building}
            floor={f}
            mode={mode}
            dimmed={dimmed}
            hovered={hovered}
          />
        ))
      ) : (
        <SimpleBlock building={building} dimmed={dimmed} hovered={hovered} selected={selected} />
      )}
      {mode.kind === 'building' && building.floors.length > 0 && <FloorTags building={building} />}
      {(hovered && mode.kind === 'campus') || mode.kind === 'building' ? (
        <Html
          position={[building.center[0], labelY, building.center[1]]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="whitespace-nowrap rounded-full border border-accent/60 bg-[#0b1222]/80 px-3 py-1 text-sm font-semibold text-white shadow-[0_0_16px_rgba(79,209,255,0.45)] backdrop-blur">
            {building.name}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/** 공통 포인터 핸들러: 캠퍼스 보기에서는 건물 선택, 층 분해 보기에서는 층 선택 */
function usePointer(building: Building, floorIndex?: number) {
  const hover = useCampusStore((s) => s.hover);
  const select = useCampusStore((s) => s.select);
  const selectFloor = useCampusStore((s) => s.selectFloor);
  const selectedId = useCampusStore((s) => s.selectedId);
  const pickOnMap = useCampusStore((s) => s.pickOnMap);

  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      hover(building.id);
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      hover(null);
      document.body.style.cursor = '';
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (pickOnMap(building.id)) return; // 길찾기 출발·도착 고르는 중
      if (selectedId !== building.id) select(building.id);
      else if (floorIndex !== undefined) selectFloor(floorIndex);
    },
  };
}

function FloorSlab({
  building,
  floor,
  mode,
  dimmed,
  hovered,
}: {
  building: Building;
  floor: FloorInfo;
  mode: ViewMode;
  dimmed: boolean;
  hovered: boolean;
}) {
  const geometry = useMemo(
    () => extrudeFootprint(floor.outline, building.floor_height),
    [floor.outline, building.floor_height],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const target = floorPose(building, floor, mode, dimmed);
  const isPlate = mode.kind === 'floor' && mode.index === floor.index;
  const pointer = usePointer(building, floor.index);

  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m || !mat.current) return;
    const k = 1 - Math.exp(-EASE * delta);
    m.position.y += (target.y - m.position.y) * k;
    m.scale.y += (target.scaleY - m.scale.y) * k;
    mat.current.opacity += (target.opacity - mat.current.opacity) * k;
    m.visible = mat.current.opacity > 0.02;
    // 숨겨진 위층이 클릭을 가로채지 않게
    m.raycast = target.opacity < 0.05 ? NO_RAYCAST : THREE.Mesh.prototype.raycast;
  });

  const color = isPlate
    ? '#1b2742'
    : hovered && mode.kind !== 'floor'
      ? COLORS.buildingHover
      : mode.kind === 'building'
        ? '#cfe0f5'
        : COLORS.building;

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      position-y={floor.index * building.floor_height}
      castShadow={!dimmed}
      receiveShadow
      {...pointer}
    >
      <meshStandardMaterial
        ref={mat}
        color={color}
        roughness={0.55}
        metalness={0.05}
        transparent
        depthWrite={target.opacity > 0.5}
        emissive={COLORS.edge}
        emissiveIntensity={hovered && mode.kind === 'campus' ? 0.18 : 0}
      />
      <Edges
        threshold={20}
        color={COLORS.edge}
        transparent
        opacity={dimmed ? 0.06 : isPlate ? 1 : mode.kind === 'floor' ? 0.25 : 0.45}
      />
    </mesh>
  );
}

/** 층 데이터가 없는 건물 */
function SimpleBlock({
  building,
  dimmed,
  hovered,
  selected,
}: {
  building: Building;
  dimmed: boolean;
  hovered: boolean;
  selected: boolean;
}) {
  const geometry = useMemo(
    () => extrudeFootprint(building.footprint, totalHeight(building)),
    [building],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const pointer = usePointer(building);
  return (
    <mesh geometry={geometry} castShadow receiveShadow {...pointer}>
      <meshStandardMaterial
        color={selected ? COLORS.buildingSelected : hovered ? COLORS.buildingHover : COLORS.building}
        transparent
        opacity={dimmed ? 0.16 : 1}
        emissive={COLORS.edge}
        emissiveIntensity={selected ? 0.35 : hovered ? 0.18 : 0}
      />
      <Edges
        threshold={20}
        color={COLORS.edge}
        transparent
        opacity={dimmed ? 0.06 : selected || hovered ? 1 : 0.35}
      />
    </mesh>
  );
}

/** 층 분해 보기에서 각 층 옆에 붙는 클릭 가능한 층 이름표 */
function FloorTags({ building }: { building: Building }) {
  const selectFloor = useCampusStore((s) => s.selectFloor);
  const b = useMemo(() => bounds(building.footprint), [building.footprint]);
  return (
    <>
      {building.floors.map((f) => {
        const pose = floorPose(building, f, { kind: 'building' }, false);
        return (
          <Html
            key={f.index}
            position={[b.maxX + 6, pose.y + building.floor_height / 2, b.cz]}
            center
            zIndexRange={[20, 10]}
          >
            <button
              onClick={() => selectFloor(f.index)}
              className="whitespace-nowrap rounded-lg border border-accent/50 bg-[#0b1222]/85 px-2 py-0.5 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-accent hover:text-[#06101f]"
            >
              {f.label}
              {f.room_count > 0 && <span className="ml-1 font-normal opacity-70">{f.room_count}</span>}
            </button>
          </Html>
        );
      })}
    </>
  );
}
