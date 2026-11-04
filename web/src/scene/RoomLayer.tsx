import { Edges, Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COLORS } from '../config';
import { useCampusStore } from '../store/useCampusStore';
import type { Building, Room } from '../types/generated/campus';
import { roomBase } from './layout';

const SPACE_H = 2.4;
const FACILITY_H = 1.1;

/** 시설물 아이콘 (그룹 → 이모지) */
const FACILITY_ICON: Record<string, string> = {
  stairs: '↕',
  elevators: '🛗',
  entrances: '🚪',
};
const facilityIcon = (r: Room) =>
  r.group ? (FACILITY_ICON[r.group] ?? (r.name.includes('화장실') ? '🚻' : '•')) : '•';

/** 선택한 층의 강의실·시설 */
export function RoomLayer() {
  const selectedId = useCampusStore((s) => s.selectedId);
  const floorIndex = useCampusStore((s) => s.floorIndex);
  const building = useCampusStore((s) => s.building(selectedId));
  const floor = useCampusStore((s) =>
    selectedId !== null && floorIndex !== null
      ? s.interiors[selectedId]?.floors[floorIndex]
      : undefined,
  );

  if (!building || !floor || floorIndex === null) return null;
  return (
    <group key={`${building.id}:${floorIndex}`} position-y={roomBase(building, floorIndex)}>
      {floor.rooms.map((r) => (
        <RoomMesh key={r.id} room={r} building={building} />
      ))}
    </group>
  );
}

function roomGeometry(room: Room, height: number) {
  const toVec = ([x, z]: [number, number]) => new THREE.Vector2(x, -z);
  const shape = new THREE.Shape(room.polygon.map(toVec));
  for (const hole of room.holes) shape.holes.push(new THREE.Path(hole.map(toVec)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function centroid(points: [number, number][]): [number, number] {
  let x = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    z += p[1];
  }
  return [x / points.length, z / points.length];
}

function RoomMesh({ room, building }: { room: Room; building: Building }) {
  const isFacility = room.category === '시설물';
  const height = isFacility ? FACILITY_H : SPACE_H;
  const geometry = useMemo(() => roomGeometry(room, height), [room, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const hovered = useCampusStore((s) => s.hoveredRoomId === room.id);
  const selected = useCampusStore((s) => s.selectedRoomId === room.id);
  const hoverRoom = useCampusStore((s) => s.hoverRoom);
  const selectRoom = useCampusStore((s) => s.selectRoom);
  const pickOnMap = useCampusStore((s) => s.pickOnMap);

  // 층을 고르면 바닥에서 올라오는 연출
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (mesh.current && mesh.current.scale.y < 1) {
      mesh.current.scale.y = Math.min(1, mesh.current.scale.y + delta * 3);
    }
  });

  const [cx, cz] = useMemo(() => centroid(room.polygon), [room.polygon]);
  const base = room.color.toUpperCase() === '#FFFFFF' ? '#d8e1ef' : room.color;

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoverRoom(room.id);
    document.body.style.cursor = 'pointer';
  };
  const onOut = () => {
    hoverRoom(null);
    document.body.style.cursor = '';
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (room.category === '공간' && pickOnMap(building.id, room.id)) return;
    selectRoom(room.id);
  };

  return (
    <group>
      <mesh
        ref={mesh}
        geometry={geometry}
        scale-y={0.01}
        castShadow
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
      >
        <meshStandardMaterial
          color={selected ? COLORS.buildingSelected : base}
          roughness={0.6}
          emissive={selected ? COLORS.edge : '#ffffff'}
          emissiveIntensity={selected ? 0.7 : hovered ? 0.22 : 0}
        />
        <Edges
          threshold={20}
          color={selected ? '#ffffff' : '#0b1222'}
          transparent
          opacity={selected ? 1 : 0.5}
        />
      </mesh>
      <Html
        position={[cx, height + (selected ? 3 : 1), cz]}
        center
        zIndexRange={[selected ? 30 : 15, 0]}
        style={{ pointerEvents: 'none' }}
      >
        {isFacility ? (
          <span className="text-[13px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{facilityIcon(room)}</span>
        ) : (
          <span
            className={
              selected
                ? 'whitespace-nowrap rounded-full bg-accent px-2.5 py-0.5 text-sm font-bold text-[#06101f] shadow-[0_0_20px_rgba(79,209,255,0.8)]'
                : 'whitespace-nowrap text-[11px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]'
            }
          >
            {room.name.length > 9 ? `${room.name.slice(0, 8)}…` : room.name}
          </span>
        )}
      </Html>
    </group>
  );
}
