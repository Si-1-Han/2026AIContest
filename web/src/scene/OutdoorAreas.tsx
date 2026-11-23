import { Line } from '@react-three/drei';
import clipping from 'polygon-clipping';
import { useEffect, useMemo } from 'react';
import { SPINE_DRIVEWAY_WIDTH, SPINE_DRIVEWAY_Z, spineDistanceAtZ, spineLocal, spinePoint } from '../features/tour/campusSpine';
import { flatShape } from '../lib/geometry';
import { useCampusStore } from '../store/useCampusStore';
import type { OutdoorArea } from '../types/generated/campus';

type Point = [number, number, number];
type PlanPoint = [number, number];
const SURFACE = { field: '#377653', tennis: '#397f83', parking: '#394456', gate: '#24556b' };
const EDGE = { field: '#8fbf8b', tennis: '#9ae0cc', parking: '#8397b5', gate: '#ffd166' };

/** 야외시설을 지도에서 선택하거나 길찾기 출발·도착지로 지정한다. */
export function OutdoorAreas() {
  const areas = useCampusStore((s) => s.campus?.outdoor_areas);
  return (
    <group>
      {areas?.map((area) => (
        <Area key={area.id} area={area} />
      ))}
    </group>
  );
}

function Area({ area }: { area: OutdoorArea }) {
  const selected = useCampusStore((s) => s.selectedId === area.id);
  const hovered = useCampusStore((s) => s.hoveredId === area.id);
  const select = useCampusStore((s) => s.select);
  const hover = useCampusStore((s) => s.hover);
  const pickOnMap = useCampusStore((s) => s.pickOnMap);
  const choose = () => {
    if (!pickOnMap(area.id)) select(area.id);
  };
  const geometry = useMemo(() => flatShape(area.footprint), [area.footprint]);
  const edge = useMemo(
    () => [...area.footprint, area.footprint[0]!].map(([x, z]): Point => [x, 0.22, z]),
    [area.footprint],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh
        geometry={geometry}
        position-y={0.12}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          choose();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          hover(area.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          hover(null);
          document.body.style.cursor = '';
        }}
      >
        <meshStandardMaterial
          color={SURFACE[area.kind]}
          roughness={0.95}
          emissive="#4fd1ff"
          emissiveIntensity={selected ? 0.25 : hovered ? 0.12 : 0}
        />
      </mesh>
      <Line
        points={edge}
        color={selected || hovered ? '#4fd1ff' : EDGE[area.kind]}
        lineWidth={selected ? 2.5 : 1.5}
        raycast={() => null}
      />
      {area.kind === 'parking' && <ParkingMarkings area={area} />}
      {(area.kind === 'field' || area.kind === 'tennis') && <CourtMarkings area={area} />}
      {area.kind === 'gate' && (
        <Line
          points={[
            [area.center[0], 0.3, area.center[1]],
            [area.center[0], 5, area.center[1]],
          ]}
          color="#ffd166"
          lineWidth={2}
          raycast={() => null}
        />
      )}
    </group>
  );
}

const BAY_WIDTH = 2.6;
const BAY_DEPTH = 4.8;
const ROW_SPACING = 11.2;
const PARKING_DRIVEWAYS = SPINE_DRIVEWAY_Z.map(spineDistanceAtZ);

function parkingAxes(outline: PlanPoint[]) {
  const sides = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    return { a, dx, dz, length: Math.hypot(dx, dz) };
  });
  const { a: [x, z], dx, dz, length } = sides.reduce((longest, side) => side.length > longest.length ? side : longest);
  const ux = dx / length, uz = dz / length;
  return {
    local: ([px, pz]: PlanPoint): PlanPoint => [(px - x) * ux + (pz - z) * uz, -(px - x) * uz + (pz - z) * ux],
    point: (u: number, v: number): PlanPoint => [x + u * ux - v * uz, z + u * uz + v * ux],
  };
}

function ParkingMarkings({ area }: { area: OutdoorArea }) {
  const points = useMemo(() => {
    const outline = area.footprint;
    const central = area.id === 'parking_834838406';
    const { local, point } = central ? {
      local: ([x, z]: PlanPoint): PlanPoint => {
        const { along, side } = spineLocal(x, z);
        return [along, side];
      },
      point: spinePoint,
    } : parkingAxes(outline);
    const uv = outline.map(local);
    const along = uv.map(([u]) => u), across = uv.map(([, v]) => v);
    const lastU = Math.max(...along) - BAY_WIDTH - 0.5;
    const lastV = Math.max(...across) - BAY_DEPTH - 0.5;
    const lines: Point[] = [];
    const onSurface = ([x, z]: PlanPoint): Point => [x, 0.25, z];
    for (let v = Math.min(...across) + 1; v <= lastV; v += ROW_SPACING) {
      for (let u = Math.min(...along) + 1; u <= lastU; u += BAY_WIDTH) {
        const end = u + BAY_WIDTH;
        if (central && PARKING_DRIVEWAYS.some(entry => u < entry + SPINE_DRIVEWAY_WIDTH / 2 && end > entry - SPINE_DRIVEWAY_WIDTH / 2)) continue;
        const bay = [point(u, v), point(u, v + BAY_DEPTH), point(end, v + BAY_DEPTH), point(end, v)];
        if (clipping.difference([bay], [outline]).length) continue;
        const [a, b, c, d] = bay.map(onSurface) as [Point, Point, Point, Point];
        lines.push(a, b, b, c, c, d);
      }
    }
    return lines;
  }, [area]);

  return points.length > 0 && <Line points={points} segments color="#eef2f6" lineWidth={1.1} raycast={() => null} />;
}

/** 사각 외곽선에 맞춰 선을 배치해 코트 방향과 캠퍼스 좌표를 일치시킨다. */
function CourtMarkings({ area }: { area: OutdoorArea }) {
  const lines = useMemo(() => {
    if (area.footprint.length !== 4) return [];
    const [a, b, c, d] = area.footprint;
    const point = (u: number, v: number, height = 0.25): Point => [
      (1 - v) * ((1 - u) * a![0] + u * b![0]) + v * ((1 - u) * d![0] + u * c![0]),
      height,
      (1 - v) * ((1 - u) * a![1] + u * b![1]) + v * ((1 - u) * d![1] + u * c![1]),
    ];
    const rectangle = (u0: number, v0: number, u1: number, v1: number) => [
      point(u0, v0),
      point(u1, v0),
      point(u1, v1),
      point(u0, v1),
      point(u0, v0),
    ];
    // 선은 시설을 알아보기 위한 표현이며 측량·경기 규격 데이터가 아니다.
    if (area.kind === 'tennis') {
      return [
        rectangle(0.02, 0.02, 0.98, 0.98),
        [point(0.02, 0.14), point(0.98, 0.14)],
        [point(0.02, 0.86), point(0.98, 0.86)],
        [point(0.23, 0.14), point(0.23, 0.86)],
        [point(0.77, 0.14), point(0.77, 0.86)],
        [point(0.23, 0.5), point(0.77, 0.5)],
        [point(0.5, 0, 0.9), point(0.5, 1, 0.9)],
      ];
    }
    const length = Math.hypot(b![0] - a![0], b![1] - a![1]);
    const width = Math.hypot(d![0] - a![0], d![1] - a![1]);
    const circle = Array.from({ length: 49 }, (_, i) => {
      const angle = (i / 48) * Math.PI * 2;
      return point(0.5 + (Math.cos(angle) * 7) / length, 0.5 + (Math.sin(angle) * 7) / width);
    });
    return [
      rectangle(0.06, 0.06, 0.94, 0.94),
      [point(0.5, 0.06), point(0.5, 0.94)],
      circle,
      rectangle(0.06, 0.23, 0.21, 0.77),
      rectangle(0.79, 0.23, 0.94, 0.77),
      rectangle(0.06, 0.36, 0.12, 0.64),
      rectangle(0.88, 0.36, 0.94, 0.64),
    ];
  }, [area]);

  return (
    <group>
      {lines.map((points, i) => (
        <Line key={i} points={points} color="#e0ece2" lineWidth={1.2} raycast={() => null} />
      ))}
    </group>
  );
}
