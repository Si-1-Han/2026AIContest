import { Grid, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { COLORS } from '../config';
import { flatShape } from '../lib/geometry';
import { useCampusStore } from '../store/useCampusStore';

export function Ground() {
  const boundary = useCampusStore((s) => s.campus?.boundary);
  const campusGeo = useMemo(() => (boundary ? flatShape(boundary) : null), [boundary]);
  const outline = useMemo(
    () => (boundary ? [...boundary, boundary[0]!].map(([x, z]) => [x, 0.3, z] as const) : null),
    [boundary],
  );

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[1600, 64]} />
        <meshStandardMaterial color={COLORS.ground} roughness={1} />
      </mesh>
      <Grid
        position={[0, 0.02, 0]}
        args={[2000, 2000]}
        cellSize={10}
        cellThickness={0.4}
        cellColor="#1c2a48"
        sectionSize={100}
        sectionThickness={0.8}
        sectionColor="#24365c"
        fadeDistance={1100}
        fadeStrength={1.5}
        infiniteGrid
      />
      {campusGeo && (
        <mesh geometry={campusGeo} position-y={0.08} receiveShadow>
          <meshStandardMaterial color={COLORS.campus} roughness={0.9} />
        </mesh>
      )}
      {outline && (
        <Line points={outline} color={COLORS.edge} lineWidth={1.5} transparent opacity={0.45} />
      )}
    </group>
  );
}
