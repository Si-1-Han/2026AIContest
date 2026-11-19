import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TreePlacement } from './scenery';
import { useSurfaceMaps } from './materials';

type Species = TreePlacement['species'];
const foliageColors: Record<Species, string[]> = {
  pine: ['#356e46', '#4d874b', '#649653'],
  broadleaf: ['#4b883d', '#6d9f43', '#39733b', '#85ac54'],
  flowering: ['#ffbdd8', '#ef9cb9', '#ffe0e8', '#f8c9dd'],
  ginkgo: ['#7fa237', '#a0bd4d', '#8db044'],
};
function random(seed: number) {
  let state = seed;
  return () => { state = state * 16807 % 2147483647; return state / 2147483647; };
}
/** 굽은 줄기, 가늘어지는 가지, 비대칭 수관과 잎 무리를 사용한다. 원뿔·구체 수관은 사용하지 않는다. */
export function treeGeometry(species: Species, variant: number) {
  const rand = random(7231 + variant * 839 + (species === 'pine' ? 34 : species === 'flowering' ? 187 : 0));
  const wood: THREE.BufferGeometry[] = [];
  const pos: number[] = [], normal: number[] = [], uv: number[] = [], colors: number[] = [];
  const branch = (a: THREE.Vector3, b: THREE.Vector3, bottom: number, top: number) => {
    const g = new THREE.CylinderGeometry(top, bottom, a.distanceTo(b), 9);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    const center = a.clone().add(b).multiplyScalar(0.5); g.translate(center.x, center.y, center.z); wood.push(g);
  };
  const pine = species === 'pine';
  const height = pine ? 7.8 : species === 'flowering' ? 5.8 : species === 'ginkgo' ? 9.0 : 7.1;
  const palette = foliageColors[species];
  const trunk = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.16, 2.4, 0.08), new THREE.Vector3(-0.12, 4.2, 0.12), new THREE.Vector3(0.18, height - 0.5, -0.08)];
  for (let i = 0; i < trunk.length - 1; i++) branch(trunk[i]!, trunk[i + 1]!, 0.2 - i * 0.045, 0.15 - i * 0.045);
  const color = new THREE.Color();
  for (let cluster = 0; cluster < 17; cluster++) {
    const angle = cluster * 2.399 + rand() * 0.4;
    const radius = pine ? 1.1 + rand() * 1.6 : Math.sqrt(rand()) * (species === 'ginkgo' ? 1.9 : 2.35);
    const cx = Math.cos(angle) * radius, cz = Math.sin(angle) * radius;
    const cy = pine ? 4.6 + cluster % 3 * 1.13 + rand() * 0.6 : height - 2.0 + rand() * 2.3 - radius * 0.14;
    branch(new THREE.Vector3(0, Math.max(2.8, cy - 1.2), 0), new THREE.Vector3(cx, cy, cz), 0.065, 0.018);
    const spread = pine ? 1.1 : 1.25, vertical = pine ? 0.48 : 0.9;
    for (let leaf = 0; leaf < 30; leaf++) {
      const theta = rand() * Math.PI * 2, r = Math.sqrt(rand());
      const center = new THREE.Vector3(cx + Math.cos(theta) * r * spread, cy + (rand() - 0.5) * vertical * 2, cz + Math.sin(theta) * r * spread);
      const size = (pine ? 0.7 : 0.8) + rand() * 0.5;
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI));
      const vertices = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => new THREE.Vector3(x! * size, y! * size, 0).applyQuaternion(rotation).add(center));
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
      color.set(palette[Math.floor(rand() * palette.length)]!);
      const coords = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const i of [0, 1, 2, 0, 2, 3]) { const v = vertices[i]!; pos.push(v.x, v.y, v.z); normal.push(n.x, n.y, n.z); uv.push(...coords[i]!); colors.push(color.r, color.g, color.b); }
    }
  }
  const foliage = new THREE.BufferGeometry();
  foliage.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); foliage.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); foliage.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); foliage.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); foliage.computeBoundingSphere();
  const bark = mergeGeometries(wood)!; wood.forEach(g => g.dispose());
  return { bark, foliage };
}

function useLeafTexture(species: Species) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#eeeeda'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(128, 240); ctx.quadraticCurveTo(115, 130, 132, 18); ctx.stroke();
    if (species === 'pine') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.8;
      for (let y = 35; y < 230; y += 10) for (const side of [-1, 1]) for (let j = 0; j < 3; j++) {
        ctx.beginPath(); ctx.moveTo(128, y + 30); ctx.quadraticCurveTo(128 + side * (35 + j * 10), y + 20, 128 + side * (45 + j * 14), y - 30 + j * 12); ctx.stroke();
      }
    } else if (species === 'flowering') {
      // 가지 위에 꽃잎과 연둣빛 잎을 같이 그려 가까이에서도 꽃송이가 보인다.
      for (const [x, y, size] of [[71, 85, 24], [139, 53, 19], [187, 96, 23], [122, 133, 25], [177, 170, 18], [74, 179, 23], [131, 205, 16]] as const) {
        ctx.strokeStyle = '#98a363';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(128, 235);
        ctx.quadraticCurveTo(123, y + 35, x, y);
        ctx.stroke();
        ctx.fillStyle = '#8fa65e';
        ctx.beginPath();
        ctx.ellipse(x - size * 0.85, y + size * 0.8, size * 0.7, size * 0.29, -0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff2f7';
        for (let petal = 0; petal < 5; petal++) {
          const angle = petal * Math.PI * 2 / 5 + x * 0.08;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(angle) * size * 0.48, y + Math.sin(angle) * size * 0.48, size * 0.57, size * 0.39, angle, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#f5ce8c';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (species === 'ginkgo') {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) {
        const y = 35 + i * 51;
        ctx.beginPath(); ctx.moveTo(128, y + 30); ctx.lineTo(66, y - 4); ctx.quadraticCurveTo(77, y - 55, 128, y - 26); ctx.quadraticCurveTo(179, y - 55, 190, y - 4); ctx.closePath(); ctx.fill();
      }
    } else for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
      const x = 128 + side * (26 + i % 3 * 9), y = 40 + i * 27;
      ctx.fillStyle = i % 2 ? '#f1f1dc' : '#ffffff';
      ctx.beginPath(); ctx.moveTo(128, y + 25); ctx.quadraticCurveTo(x + side * 58, y + 20, x + side * 34, y - 15); ctx.quadraticCurveTo(x - side * 10, y - 14, 128, y + 25); ctx.fill();
    }
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }, [species]);
  useEffect(() => () => texture.dispose(), [texture]); return texture;
}

function TreeInstances({ trees, species, variant, leafTexture, barkMaps }: { trees: TreePlacement[]; species: Species; variant: number; leafTexture: THREE.Texture; barkMaps: ReturnType<typeof useSurfaceMaps> }) {
  const barkRef = useRef<THREE.InstancedMesh>(null), leafRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => treeGeometry(species, variant), [species, variant]);
  useEffect(() => () => { geometry.bark.dispose(); geometry.foliage.dispose(); }, [geometry]);
  useLayoutEffect(() => {
    const matrix = new THREE.Object3D();
    for (const [i, tree] of trees.entries()) {
      matrix.position.set(tree.x, tree.y ?? 0, tree.z); matrix.rotation.y = tree.seed * 73;
      matrix.scale.set(tree.scale * (tree.shrub ? 0.5 : 1), tree.scale * (tree.shrub ? 0.16 : 1), tree.scale * (tree.shrub ? 0.5 : 1)); matrix.updateMatrix();
      barkRef.current!.setMatrixAt(i, matrix.matrix); leafRef.current!.setMatrixAt(i, matrix.matrix);
    }
    for (const ref of [barkRef, leafRef]) { ref.current!.instanceMatrix.needsUpdate = true; ref.current!.computeBoundingSphere(); }
  }, [trees]);
  if (!trees.length) return null;
  return <group>
    <instancedMesh ref={barkRef} args={[geometry.bark, undefined, trees.length]} castShadow receiveShadow><meshStandardMaterial color="#76614c" {...barkMaps} roughness={1} /></instancedMesh>
    <instancedMesh ref={leafRef} args={[geometry.foliage, undefined, trees.length]} castShadow receiveShadow><meshStandardMaterial map={leafTexture} vertexColors alphaTest={0.43} side={THREE.DoubleSide} roughness={0.95} shadowSide={THREE.DoubleSide} /></instancedMesh>
  </group>;
}

export function Trees({ trees }: { trees: TreePlacement[] }) {
  const barkMaps = useSurfaceMaps('bark');
  return <group>{(['pine', 'broadleaf', 'flowering', 'ginkgo'] as Species[]).map(species => <SpeciesTrees key={species} species={species} trees={trees} barkMaps={barkMaps} />)}</group>;
}

function SpeciesTrees({ species, trees, barkMaps }: { species: Species; trees: TreePlacement[]; barkMaps: ReturnType<typeof useSurfaceMaps> }) {
  const texture = useLeafTexture(species);
  const groups = useMemo(() => [0, 1, 2].map(variant => ({ species, variant, trees: trees.filter(t => t.species === species && Math.floor(t.seed * 113) % 3 === variant) })).filter(g => g.trees.length), [species, trees]);
  return <group>{groups.map(g => <TreeInstances key={g.variant} {...g} leafTexture={texture} barkMaps={barkMaps} />)}</group>;
}
