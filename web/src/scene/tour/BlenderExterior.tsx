import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { Building } from '../../types/generated/campus';
import manifest from '../../../public/models/tour/manifest.json';

interface ModelEntry { file: string; sha256: string }
const models = manifest.models as Record<string, ModelEntry>;

function disposeModel(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  textures.forEach(t => t.dispose());
}

/** 가까운 건물만 압축 GLB를 로드한다. 로딩/오류 중에는 절차적 외관을 유지한다. */
export function useBlenderExterior(building: Building) {
  const [requested, setRequested] = useState(false);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const requestedRef = useRef(false);
  useFrame(({ camera }) => {
    if (!requestedRef.current && Math.hypot(camera.position.x - building.center[0], camera.position.z - building.center[1]) < 130) {
      requestedRef.current = true; setRequested(true);
    }
  });
  useEffect(() => {
    const entry = models[building.id];
    if (!requested || !entry) return;
    let cancelled = false, owned: THREE.Group | null = null;
    const decoder = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`).setWorkerLimit(1);
    const loader = new GLTFLoader().setDRACOLoader(decoder);
    setModel(null);
    void loader.loadAsync(`${import.meta.env.BASE_URL}models/tour/${entry.file}?v=${manifest.revision}`).then(gltf => {
      decoder.dispose();
      if (cancelled) { disposeModel(gltf.scene); return; }
      owned = gltf.scene;
      owned.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      setModel(owned);
    }).catch(error => {
      decoder.dispose();
      if (!cancelled) console.warn(`[tour] ${building.id}: 절차적 외관으로 계속 표시합니다.`, error);
    });
    return () => { cancelled = true; decoder.dispose(); if (owned) disposeModel(owned); };
  }, [requested, building.id]);
  return model;
}
