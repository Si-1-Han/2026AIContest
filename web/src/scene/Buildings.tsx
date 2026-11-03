import { Edges, Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COLORS } from '../config';
import { buildingHeight, extrudeFootprint } from '../lib/geometry';
import { useCampusStore } from '../store/useCampusStore';
import type { Building } from '../types/generated/campus';

/** 건물이 땅에서 솟아오르는 등장 연출 (인트로 1차 버전) */
const RISE_DELAY = 0.6;
const RISE_STAGGER = 0.07;
const RISE_SPEED = 2.2;

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

function BuildingMesh({ building, order }: { building: Building; order: number }) {
  const height = buildingHeight(building.levels, building.floor_height);
  const geometry = useMemo(
    () => extrudeFootprint(building.footprint, height),
    [building.footprint, height],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const hovered = useCampusStore((s) => s.hoveredId === building.id);
  const selected = useCampusStore((s) => s.selectedId === building.id);
  const hover = useCampusStore((s) => s.hover);
  const select = useCampusStore((s) => s.select);

  const group = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (!group.current || group.current.scale.y >= 1) return;
    elapsed.current += delta;
    const t = Math.max(0, elapsed.current - RISE_DELAY - order * RISE_STAGGER) * RISE_SPEED;
    const eased = 1 - Math.pow(1 - Math.min(t, 1), 3);
    group.current.scale.y = Math.max(eased, 0.0001);
  });

  const color = selected
    ? COLORS.buildingSelected
    : hovered
      ? COLORS.buildingHover
      : COLORS.building;

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hover(building.id);
    document.body.style.cursor = 'pointer';
  };
  const onOut = () => {
    hover(null);
    document.body.style.cursor = '';
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(building.id);
  };

  return (
    <group ref={group} scale-y={0.0001}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
      >
        <meshStandardMaterial
          color={color}
          roughness={0.55}
          metalness={0.05}
          emissive={COLORS.edge}
          emissiveIntensity={selected ? 0.35 : hovered ? 0.18 : 0}
        />
        <Edges
          threshold={20}
          color={COLORS.edge}
          transparent
          opacity={selected || hovered ? 1 : 0.35}
        />
      </mesh>
      {(hovered || selected) && (
        <Html
          position={[building.center[0], height + 6, building.center[1]]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="whitespace-nowrap rounded-full border border-accent/60 bg-[#0b1222]/80 px-3 py-1 text-sm font-semibold text-white shadow-[0_0_16px_rgba(79,209,255,0.45)] backdrop-blur">
            {building.name}
          </div>
        </Html>
      )}
    </group>
  );
}
