import * as THREE from 'three';
import { placeFacadePart, type FacadeEdge } from './facadeGeometry';

export const MUSIC_STONE = new THREE.Color('#c6beb3');
const RED_TRIM = new THREE.Color('#783d3b');
const GLASS = new THREE.Color('#536e82');
const FRAME = new THREE.Color('#283745');
const TOWER_GLASS = ['#4b6878', '#587687', '#64818e'].map((color) => new THREE.Color(color));

export function musicStoneSections(length: number) {
  return [
    { center: 2.55, width: 4.8 },
    { center: length / 2, width: 8.1 },
    { center: length - 2.55, width: 4.8 },
  ];
}

export function isMusicFront(edge: FacadeEdge) {
  return edge.nz < 0;
}

function gableShape(width: number, rise: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  return shape;
}

function archShape(radius: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI, false);
  shape.closePath();
  return shape;
}

export function makeMusicFacadeDetails(edge: FacadeEdge, height: number, floorIndex: number, topFloor: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, along: number, y: number, outward: number, color: THREE.Color) => {
    parts.push(placeFacadePart(edge, geometry, [along, y, outward], color));
  };
  const middle = edge.length / 2;

  if (topFloor) {
    for (const {center, width} of musicStoneSections(edge.length)) {
      const rise = 1.75 + (width > 5 ? 0.7 : 0);
      const gable = new THREE.ExtrudeGeometry(gableShape(width + 0.14, rise), { depth: 0.3, bevelEnabled: false });
      add(gable, center, height - 0.02, -0.18, RED_TRIM);
      add(new THREE.ShapeGeometry(gableShape(width - 0.28, rise - 0.22)), center, height - 0.02, 0.13, MUSIC_STONE);
    }
  }

  if (isMusicFront(edge)) {
    if (topFloor) {
      const spring = height * 0.24;
      add(new THREE.ShapeGeometry(archShape(2.38), 20), middle, spring, 0.10, FRAME);
      add(new THREE.ShapeGeometry(archShape(2.19), 20), middle, spring, 0.12, GLASS);
      const clockY = spring + 0.68;
      add(new THREE.CircleGeometry(0.47, 20), middle, clockY, 0.15, FRAME);
      add(new THREE.CircleGeometry(0.36, 20), middle, clockY, 0.17, MUSIC_STONE);
      add(new THREE.BoxGeometry(0.05, 0.22, 0.02), middle, clockY + 0.1, 0.19, FRAME);
      add(new THREE.BoxGeometry(0.16, 0.05, 0.02), middle + 0.06, clockY, 0.19, FRAME);
    }
    return parts;
  }

  const radius = 2.24;
  const glassHeight = topFloor ? height * 0.59 : height;
  const panes = 12;
  const sweep = Math.PI / panes;
  for (let i = 0; i < panes; i++) {
    const theta = -Math.PI / 2 + i * sweep;
    const pane = new THREE.CylinderGeometry(radius, radius, glassHeight, 1, 1, true, theta, sweep);
    add(pane, middle, glassHeight / 2, 0.1, TOWER_GLASS[(i + floorIndex) % TOWER_GLASS.length]!);
  }
  for (let i = 0; i <= panes; i++) {
    const theta = -Math.PI / 2 + i * sweep;
    add(new THREE.BoxGeometry(0.075, glassHeight, 0.075),
      middle + radius * Math.sin(theta), glassHeight / 2, 0.1 + radius * Math.cos(theta), FRAME);
  }
  for (const y of [0.06, glassHeight * 0.55, glassHeight - 0.06]) {
    add(new THREE.CylinderGeometry(radius + 0.045, radius + 0.045, 0.085, panes, 1, true, -Math.PI / 2, Math.PI),
      middle, y, 0.1, FRAME);
  }
  if (topFloor) {
    const rise = height - glassHeight;
    add(new THREE.ConeGeometry(radius + 0.07, rise, panes, 1, false, -Math.PI / 2, Math.PI),
      middle, glassHeight + rise / 2, 0.1, RED_TRIM);
  }
  return parts;
}
