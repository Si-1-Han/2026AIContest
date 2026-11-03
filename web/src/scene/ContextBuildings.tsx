import { useEffect, useMemo } from 'react';
import { COLORS } from '../config';
import { mergeContext } from '../lib/geometry';
import { useCampusStore } from '../store/useCampusStore';

/** 캠퍼스 밖 주변 건물 — 배경용, 클릭 불가 */
export function ContextBuildings() {
  const context = useCampusStore((s) => s.campus?.context);
  const geometry = useMemo(() => (context ? mergeContext(context) : null), [context]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    // 반투명 + depthWrite 끔: 앞쪽 고층 아파트가 캠퍼스를 가리지 않게
    <mesh geometry={geometry} receiveShadow raycast={() => null} renderOrder={-1}>
      <meshStandardMaterial
        color={COLORS.context}
        roughness={0.85}
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </mesh>
  );
}
