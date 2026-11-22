import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';

/** 날개 판: 어깨(x=0)에서 날개 끝(x=1), 앞전(z=-0.2)에서 뒷전(z=0.3). */
const SPAN = 1, CHORD = 0.5, LEAD = -0.2;

/** 까치 날개 깃털 텍스처. 왼쪽이 어깨, 위쪽이 앞전이다. */
function wingTexture() {
  const w = 512, h = 256, canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const feather = (x: number, y: number, length: number, width: number, angle: number, fill: string | CanvasGradient, edge: string) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, -width / 2); ctx.lineTo(length - width, -width / 2);
    ctx.quadraticCurveTo(length, -width / 2, length, 0); ctx.quadraticCurveTo(length, width / 2, length - width, width / 2);
    ctx.lineTo(0, width / 2); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(length - width * 0.6, 0); ctx.strokeStyle = 'rgba(160,180,220,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  };
  const sheen = (x0: number, x1: number) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#0c111b'); g.addColorStop(0.55, '#1b2740'); g.addColorStop(1, '#0e1421'); return g; };
  // 둘째날개깃: 어깨 쪽 뒷전을 이루는 짧고 넓은 깃
  for (let i = 0; i < 10; i++) feather(8 + i * 27, 70, 150 + (i % 2) * 8, 30, Math.PI / 2 - 0.12 - i * 0.02, sheen(0, 160), '#05080d');
  // 첫째날개깃: 손목에서 부채꼴로 펼쳐지는 긴 깃. 안쪽 깃 바탕이 흰 까치 무늬
  for (let i = 0; i < 9; i++) {
    const length = 175 + i * 9, x = 285 + i * 7, y = 62 + i * 2;
    const g = ctx.createLinearGradient(0, 0, length, 0);
    g.addColorStop(0, '#f2f3ef'); g.addColorStop(0.55, '#e4e7e4'); g.addColorStop(0.62, '#141b29'); g.addColorStop(1, '#0b0f17');
    feather(x, y, length, 24, 1.25 - i * 0.135, g, '#06090f');
  }
  // 날개덮깃: 앞전을 덮는 윤기 있는 검푸른 깃
  ctx.beginPath(); ctx.moveTo(0, 30); ctx.quadraticCurveTo(160, 8, 300, 34); ctx.quadraticCurveTo(360, 50, 330, 92);
  ctx.quadraticCurveTo(170, 120, 0, 104); ctx.closePath();
  const cover = ctx.createLinearGradient(0, 10, 0, 110); cover.addColorStop(0, '#2c3d63'); cover.addColorStop(0.5, '#162036'); cover.addColorStop(1, '#0c121e');
  ctx.fillStyle = cover; ctx.fill();
  for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(10 + i * 22, 98 - Math.sin(i / 13 * Math.PI) * 6, 12, 0, Math.PI); ctx.strokeStyle = 'rgba(70,95,150,0.45)'; ctx.lineWidth = 1.2; ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function wingGeometry() {
  const geometry = new THREE.PlaneGeometry(SPAN, CHORD);
  // 평면(xy)을 수평(xz)으로 눕히고 어깨 앞전을 원점 쪽으로 옮긴다. 텍스처 위쪽(v=1)이 앞전.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(SPAN / 2, 0, LEAD + CHORD / 2);
  return geometry;
}

export interface BirdWingsHandle {
  /** 카메라 자세와 날갯짓 상태로 날개를 놓는다. visible=false면 접힌 상태 */
  update: (camera: THREE.Camera, flap: number, phase: number, visible: boolean) => void;
}

/** 날개 자세: 내려칠 때 날개를 앞으로 크게 쓸어 깃 끝이 화면 양옆을 위에서 아래로 스치고, 활공할 때는 뒤로 젖혀 화면 밖에 둔다. */
function wingAngles(flap: number, phase: number) {
  return { lift: 0.06 + flap * 0.8 * Math.sin(phase), sweep: flap * 1.3 * -Math.cos(phase) - (1 - flap) * 0.6 };
}

/** 새의 시점 화면 가장자리에 보이는 날개. 장면 위에 항상 그려지도록 깊이 검사를 끈다. */
export const BirdWings = forwardRef<BirdWingsHandle>(function BirdWings(_, ref) {
  const root = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null);
  const leftGhost = useRef<THREE.Group>(null), rightGhost = useRef<THREE.Group>(null);
  const geometry = useMemo(wingGeometry, []);
  const materials = useMemo(() => {
    const map = wingTexture();
    const base = { map, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, depthTest: false, depthWrite: false, roughness: 0.5, metalness: 0.1 };
    return { map, wing: new THREE.MeshStandardMaterial(base), ghost: new THREE.MeshStandardMaterial({ ...base, opacity: 0.28 }) };
  }, []);
  useEffect(() => () => { geometry.dispose(); materials.map.dispose(); materials.wing.dispose(); materials.ghost.dispose(); }, [geometry, materials]);

  useImperativeHandle(ref, () => ({
    update(camera, flap, phase, visible) {
      const g = root.current;
      if (!g) return;
      g.visible = visible;
      if (!visible) return;
      g.position.copy(camera.position);
      g.quaternion.copy(camera.quaternion);
      // 잔상은 조금 앞선 위상의 날개. 빠르게 내려치는 움직임이 번져 보이게 한다.
      const pairs = [[left, right, phase], [leftGhost, rightGhost, phase - 0.32]] as const;
      for (const [l, r, p] of pairs) {
        const { lift, sweep } = wingAngles(flap, p);
        l.current?.rotation.set(0, -sweep, -lift, 'YZX');
        r.current?.rotation.set(0, sweep, lift, 'YZX');
      }
    },
  }), []);

  const half = (side: 1 | -1, r: RefObject<THREE.Group | null>, material: THREE.Material, order: number) => (
    <group ref={r} position={[side * 0.35, -0.15, -0.05]}>
      <mesh geometry={geometry} material={material} scale={[side * 0.72, 1, 0.72]} renderOrder={order} frustumCulled={false} />
    </group>
  );
  return <group ref={root} visible={false}>
    {half(-1, leftGhost, materials.ghost, 999)}{half(1, rightGhost, materials.ghost, 999)}
    {half(-1, left, materials.wing, 1000)}{half(1, right, materials.wing, 1000)}
  </group>;
});
