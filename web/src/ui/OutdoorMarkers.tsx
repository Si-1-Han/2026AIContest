import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useCampusStore } from '../store/useCampusStore';

const ICON = { field: '⚽', tennis: '🎾', parking: 'P', gate: '↗️' };

/** 3D 밖의 일반 React 트리에서 마커를 관리해 장면 전환 시 중첩 DOM 루트 해제를 피한다. */
export function OutdoorMarkers() {
  const areas = useCampusStore(s => s.campus?.outdoor_areas);
  const hovered = useCampusStore(s => s.hoveredId);
  const hover = useCampusStore(s => s.hover);
  return <div className="pointer-events-none absolute inset-0 z-10">
    {areas?.map(area => <button
      key={area.id} id={`outdoor-map-${area.id}`} aria-label={`${area.name} 선택`}
      aria-describedby={hovered === area.id ? `outdoor-label-${area.id}` : undefined}
      style={{ position: 'absolute', visibility: 'hidden', transform: 'translate(-50%, -50%)' }}
      className="pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-[#0b1222]/85 text-base shadow-md backdrop-blur hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
      onClick={() => { const s = useCampusStore.getState(); if (!s.pickOnMap(area.id)) s.select(area.id); }}
      onPointerEnter={() => hover(area.id)} onPointerLeave={() => hover(null)} onFocus={() => hover(area.id)} onBlur={() => hover(null)}
    >
      <span aria-hidden className={area.kind === 'parking' ? 'font-extrabold' : undefined}>{ICON[area.kind]}</span>
      {hovered === area.id && <span id={`outdoor-label-${area.id}`} role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-accent/60 bg-[#0b1222]/90 px-3 py-1 text-sm font-semibold text-white shadow-lg">{area.name}</span>}
    </button>)}
  </div>;
}

export function OutdoorMarkerProjector() {
  const areas = useCampusStore(s => s.campus?.outdoor_areas);
  const point = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    for (const area of areas ?? []) {
      const element = document.getElementById(`outdoor-map-${area.id}`);
      if (!element) continue;
      point.current.set(area.center[0], area.kind === 'gate' ? 6 : 2, area.center[1]).project(camera);
      const p = point.current;
      element.style.visibility = p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 ? 'visible' : 'hidden';
      element.style.left = `${(p.x + 1) * 50}%`; element.style.top = `${(1 - p.y) * 50}%`;
    }
  });
  return null;
}
