import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS } from '../config';
import { extrudeFootprint } from '../lib/geometry';
import { placeFacadePart, type FacadeEdge } from './facadeGeometry';
import { makeGemiRearDetails } from './gemiRearDetails';
import { isMusicFront, makeMusicFacadeDetails, musicStoneSections, MUSIC_STONE } from './musicFacadeDetails';
import { makeRodemRoof } from './rodemRoof';

type Point = [number, number];
type BuildingColors = { wall: string; roof: string };

const TWIN_COLORS: BuildingColors = { wall: '#d3cdc3', roof: '#b9b3ab' };

// Colors for the overview, where walls and roofs need to read from a distance.
const BUILDING_COLORS: Record<string, BuildingColors> = {
  main: { wall: '#d2cdc6', roof: '#dad6d0' },
  graduate: TWIN_COLORS,
  design: TWIN_COLORS,
  gemi: { wall: '#6a8797', roof: '#70858d' },
  music: { wall: '#884e49', roof: '#783d3b' },
  vision_center: { wall: '#e1e2de', roof: '#bfc7c7' },
  rodem: { wall: '#79584b', roof: '#3e6d6b' },
  science: { wall: '#e8e6da', roof: '#bcc7c6' },
  vision: { wall: '#e4ddca', roof: '#c6c1b2' },
  theology: { wall: '#e8e9df', roof: '#c6c7b8' },
  student_union: { wall: '#416980', roof: '#667d89' },
};
const DEFAULT_COLORS = { wall: COLORS.building, roof: COLORS.building };
const MAIN_BASE = '#a4a09b';
const MAIN_GLASS = new THREE.Color('#526b80');
const MAIN_FRAME = new THREE.Color('#283442');
const TWIN_BASE = '#4b4b50';
const TWIN_FRAME = new THREE.Color('#7d858b');
const TWIN_GLASS = new THREE.Color('#597284');
const TWIN_GLASS_LIGHT = new THREE.Color('#8da7b2');
const GEMI_FRAME = new THREE.Color('#536a77');
const GEMI_GLASS = ['#698a9d', '#7d9eaf', '#95b2bf'].map((color) => new THREE.Color(color));
const MUSIC_FRAME = new THREE.Color('#283745');
const MUSIC_GLASS = new THREE.Color('#536e82');
const RODEM_TRIM = new THREE.Color('#e1d8c7');
const RODEM_GLASS = new THREE.Color('#788b8a');
const VISION_WHITE = new THREE.Color('#e6e7e4');
const VISION_MULLION = new THREE.Color('#344d5b');
const VISION_CURTAIN = ['#648490', '#74939d', '#8ca6ae'].map((color) => new THREE.Color(color));
const VISION_TOWER_GLASS = new THREE.Color('#476d86');
const VISION_CORE_GLASS = new THREE.Color('#315971');
const VISION_OPENING = new THREE.Color('#202f38');
const VISION_SASH_GLASS = new THREE.Color('#7392a2');
const VISION_PANELS = ['#e8e9e6', '#b8bdc0', '#818b94', '#59626c'].map((color) => new THREE.Color(color));
const SCIENCE_BRICK = new THREE.Color('#bb9988');
const SCIENCE_FRAME = new THREE.Color('#4d5551');
const SCIENCE_GLASS = new THREE.Color('#5b6a66');
const SCIENCE_SILL = new THREE.Color('#cfc8ba');
const STUDENT_UNION_FRAME = new THREE.Color('#aebbc3');
const STUDENT_UNION_SHADOW = new THREE.Color('#2c4354');
const STUDENT_UNION_GLASS = ['#3679a6', '#428dbb', '#5599c5'].map((color) => new THREE.Color(color));
const STUDENT_UNION_RECESS_GLASS = ['#335e78', '#3a7191', '#4883a5'].map((color) => new THREE.Color(color));
const THEOLOGY_BRICK = new THREE.Color('#844f4a');
const THEOLOGY_FRONT = new THREE.Color('#e8e9df');
const THEOLOGY_REAR = new THREE.Color('#dcd4bb');
const THEOLOGY_FRAME = new THREE.Color('#3d484e');
const THEOLOGY_GLASS = ['#627d8c', '#7993a0', '#92a7ad'].map((color) => new THREE.Color(color));
const VISION_HALL_INFILL = new THREE.Color('#b5b6ab');
const VISION_HALL_REAR_WALL = new THREE.Color('#c8bfb3');
const VISION_HALL_REAR_INFILL = new THREE.Color('#858c90');
const VISION_HALL_FRAME = new THREE.Color('#395c61');
const VISION_HALL_PANES = ['#59838b', '#78a1a9', '#91b3b8'].map((color) => new THREE.Color(color));
const VISION_HALL_BLOCKS = ['#d3ddd8', '#becfca', '#e0e7e1'].map((color) => new THREE.Color(color));
const VISION_HALL_LINTEL = new THREE.Color('#d5c49c');
const ELEVATOR_GLASS = new THREE.Color('#568a94');
const ELEVATOR_SIDE_GLASS = new THREE.Color('#477783');

export function makeBuildingShell(
  outline: Point[],
  height: number,
  buildingId: string,
  floorIndex?: number,
) {
  const geometry = extrudeFootprint(outline, height);
  const palette = BUILDING_COLORS[buildingId] ?? DEFAULT_COLORS;
  const base = buildingId === 'main' && floorIndex === 0 ? MAIN_BASE
    : palette === TWIN_COLORS && floorIndex !== undefined && floorIndex < 2 ? TWIN_BASE
    : palette.wall;
  const wall = new THREE.Color(base);
  const roof = new THREE.Color(palette.roof);
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(normal.count * 3);

  for (let i = 0; i < normal.count; i++) {
    const color = normal.getY(i) > 0.9 ? roof : wall;
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

type Quad = (left: number, right: number, low: number, high: number, color: THREE.Color, offset?: number) => void;
type FacadeFace = FacadeEdge & { quad: Quad };

function makeFacade(outline: Point[], drawFace: (face: FacadeFace) => void) {
  const positions: number[] = [];
  const colors: number[] = [];
  const signedArea = outline.reduce((sum, [x, z], i) => {
    const [nextX, nextZ] = outline[(i + 1) % outline.length]!;
    return sum + x * nextZ - nextX * z;
  }, 0);
  for (const [i, point] of outline.entries()) {
    const next = outline[(i + 1) % outline.length]!;
    const [[ax, az], [bx, bz]] = signedArea > 0 ? [next, point] : [point, next];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1.55) continue;

    const dx = (bx - ax) / length;
    const dz = (bz - az) / length;
    const nx = -dz;
    const nz = dx;
    const x = ax + nx * 0.045;
    const z = az + nz * 0.045;
    const quad: Quad = (left, right, low, high, color, offset = 0) => {
      for (const [u, y] of [[left, low], [right, low], [right, high], [left, low], [right, high], [left, high]] as const) {
        positions.push(x + dx * u + nx * offset, y, z + dz * u + nz * offset);
        colors.push(color.r, color.g, color.b);
      }
    };
    drawFace({ start: [ax, az], dx, dz, length, nx, nz, quad });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function drawWindow(
  quad: Quad, left: number, right: number, bottom: number, top: number,
  width: number, frame: THREE.Color, glass: THREE.Color, split = false,
) {
  const low = bottom + width;
  const high = top - width;
  quad(left, right, bottom, low, frame);
  quad(left, right, high, top, frame);
  quad(left, left + width, low, high, frame);
  quad(right - width, right, low, high, frame);
  if (split) {
    const center = (left + right) / 2;
    quad(left + width, center - width / 2, low, high, glass);
    quad(center - width / 2, center + width / 2, low, high, frame);
    quad(center + width / 2, right - width, low, high, glass);
  } else {
    quad(left + width, right - width, low, high, glass);
  }
}

function makeMainWindows(outline: Point[], height: number, groundFloor: boolean, topFloor: boolean) {
  const bottom = height * (groundFloor ? 0.28 : 0.31);
  const top = height * (topFloor || groundFloor ? 0.63 : 0.74);
  const frameWidth = Math.min(0.09, height * 0.025);
  // Follow the footprint around the rounded tower, and break longer walls into window bays.
  return makeFacade(outline, ({ length, quad }) => {
    const bays = Math.max(1, Math.round(length / 3.6));
    const bayWidth = length / bays;
    const gap = length < 4.5 ? 0.06 : 0.38;
    for (let bay = 0; bay < bays; bay++) {
      drawWindow(quad, bay * bayWidth + gap, (bay + 1) * bayWidth - gap,
        bottom, top, frameWidth, MAIN_FRAME, MAIN_GLASS);
    }
  });
}

function makeTwinFacade(outline: Point[], height: number, floorIndex: number) {
  const frameWidth = Math.min(0.11, height * 0.03);
  return makeFacade(outline, ({ length, nz, quad }) => {
    if (floorIndex < 2) {
      if (nz > 0.8 && length > 8) {
        // Tall, narrow windows between the dark vertical bands on the side.
        const bays = Math.floor(length / 2.4);
        for (let bay = 0; bay < bays; bay++) {
          const center = (bay + 0.5) * length / bays;
          drawWindow(quad, center - 0.42, center + 0.42, height * 0.07, height * 0.91,
            frameWidth, TWIN_FRAME, TWIN_GLASS_LIGHT);
        }
      }
      return;
    }

    if (length < 6) return;
    const bays = Math.max(1, Math.round(length / 3.85));
    const bayWidth = length / bays;
    const halfWindowWidth = 1.25;
    for (let bay = 0; bay < bays; bay++) {
      const center = (bay + 0.5) * bayWidth;
      drawWindow(quad, center - halfWindowWidth, center + halfWindowWidth, height * 0.31, height * 0.77,
        frameWidth, TWIN_FRAME, TWIN_GLASS, true);
    }
  });
}

function makeGemiFacade(outline: Point[], height: number, floorIndex: number, topFloor: boolean) {
  const rear: FacadeEdge[] = [];
  const glass = makeFacade(outline, ({ quad, ...edge }) => {
    if (edge.nx < -0.8) rear.push(edge);
    const count = Math.max(1, Math.round(edge.length / 1.85));
    const width = edge.length / count;
    for (let bay = 0; bay < count; bay++) {
      const inset = Math.min(0.045, width * 0.03);
      const left = bay * width + inset;
      const right = (bay + 1) * width - inset;
      const pane = GEMI_GLASS[(bay + floorIndex * 2) % GEMI_GLASS.length]!;
      drawWindow(quad, left, right, height * 0.025, height * 0.69, 0.075, GEMI_FRAME, pane);
      drawWindow(quad, left, right, height * 0.69, height * 0.975, 0.075, GEMI_FRAME, GEMI_GLASS[1]!);
    }
  });

  return combineFacade(glass, makeGemiRearDetails(rear, height, floorIndex, topFloor));
}

function makeMusicFacade(outline: Point[], height: number, floorIndex: number, topFloor: boolean) {
  const details: THREE.BufferGeometry[] = [];
  const walls = makeFacade(outline, ({ quad, ...edge }) => {
    const { length } = edge;
    const drawBrickWing = (left: number, right: number) => {
      const span = right - left;
      if (span < 2) return;
      const sill = height * 0.29;
      const head = height * 0.79;
      quad(left, right, sill - 0.13, sill, MUSIC_STONE);
      quad(left, right, head, head + 0.11, MUSIC_STONE);
      const bays = Math.max(1, Math.round(span / 3.55));
      const bay = span / bays;
      for (let i = 0; i < bays; i++) {
        drawWindow(quad, left + (i + 0.12) * bay, left + (i + 0.88) * bay, sill, head,
          0.085, MUSIC_FRAME, MUSIC_GLASS, true);
      }
    };

    if (length < 35) {
      drawBrickWing(0, length);
      return;
    }

    details.push(...makeMusicFacadeDetails(edge, height, floorIndex, topFloor));
    const sections = musicStoneSections(length);
    const raised: Quad = (l, r, bottom, top, color) => quad(l, r, bottom, top, color, 0.035);
    let previous = 0;
    for (const {center, width} of sections) {
      const left = center - width / 2;
      const right = center + width / 2;
      drawBrickWing(previous, left);
      quad(left, right, 0, height, MUSIC_STONE);
      previous = right;
      if (width < 5) {
        drawWindow(raised, center - 1.16, center + 1.16, height * 0.13, height * 0.85,
          0.09, MUSIC_FRAME, MUSIC_GLASS, true);
      } else if (isMusicFront(edge)) {
        const low = height * 0.02;
        const high = height * (topFloor ? 0.24 : 0.98);
        for (const offset of [-1.14, 1.14]) {
          drawWindow(raised, center + offset - 1.14, center + offset + 1.14, low, high,
            0.085, MUSIC_FRAME, MUSIC_GLASS, true);
        }
      }
    }
    drawBrickWing(previous, length);
  });
  return combineFacade(walls, details);
}

function combineFacade(surface: THREE.BufferGeometry, details: THREE.BufferGeometry[]) {
  if (!details.length) return surface;
  const parts = [surface, ...details];
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}

function makeRodemFacade(outline: Point[], height: number, topFloor: boolean) {
  const surface = makeFacade(outline, ({length, quad}) => {
    if (length < 4.2) return;
    const count = Math.max(1, Math.round(length / 3.3));
    const bottom = height * 0.27;
    const top = height * 0.76;
    for (let bay = 0; bay < count; bay++) {
      const center = (bay + 0.5) * length / count;
      drawWindow(quad, center - 0.74, center + 0.74, bottom, top, 0.12, RODEM_TRIM, RODEM_GLASS, true);
      quad(center - 0.91, center + 0.91, bottom - 0.1, bottom, RODEM_TRIM, 0.03);
      quad(center - 0.87, center + 0.87, top, top + 0.1, RODEM_TRIM, 0.02);
    }
  });
  return topFloor ? combineFacade(surface, makeRodemRoof(outline, height)) : surface;
}

function makeVisionCenterFacade(outline: Point[], height: number, floorIndex: number, topFloor: boolean) {
  const details: THREE.BufferGeometry[] = [];
  const surface = makeFacade(outline, ({quad, ...edge}) => {
    const { length } = edge;
    if (length < 2.3) return;
    const bays = Math.max(1, Math.round(length / (floorIndex < 3 ? 2.25 : 2.02)));
    const width = length / bays;
    const coreBay = Math.floor(bays * 0.42);
    const raised: Quad = (l, r, low, high, color) => quad(l, r, low, high, color, 0.026);

    for (let i = 0; i < bays; i++) {
      const left = i * width;
      const right = left + width;
      if (floorIndex < 3) {
        const pane = VISION_CURTAIN[(i + floorIndex * 2) % VISION_CURTAIN.length]!;
        drawWindow(quad, left + 0.02, right - 0.02, height * (floorIndex === 0 ? 0.21 : 0.025),
          height * 0.65, 0.055, VISION_MULLION, pane);
        drawWindow(quad, left + 0.02, right - 0.02, height * 0.65, height * 0.975,
          0.055, VISION_MULLION, VISION_CURTAIN[(i + 1) % VISION_CURTAIN.length]!);
      } else if (floorIndex < 5) {
        drawWindow(quad, left + 0.02, right - 0.02, height * 0.035, height * 0.965,
          0.15, VISION_WHITE, VISION_TOWER_GLASS, true);
      } else {
        const pattern = (i * 7 + floorIndex * 3) % 11;
        const accent = VISION_PANELS[1 + pattern % 3]!;
        const center = (left + right) / 2;
        const core = length > 25 && i === coreBay;
        quad(left + 0.015, right - 0.015, height * 0.02, height * 0.98, core ? VISION_CORE_GLASS : VISION_PANELS[0]!);
        if (!core && pattern < 7) {
          quad(left + 0.015, left + width * 0.34, height * 0.02, height * 0.98, accent, 0.015);
        }
        drawVisionUpperWindow(edge, raised, center, height * 0.55, details);
      }
    }

    if (topFloor) {
      const slats = Math.max(1, Math.round(length / 0.72));
      for (let i = 0; i < slats; i++) {
        const post = new THREE.BoxGeometry(0.11, 1.98, 0.16);
        details.push(placeFacadePart(edge, post, [(i + 0.5) * length / slats, height + 0.99, 0.07], VISION_WHITE));
      }
      for (const lift of [0.09, 0.99, 1.95]) {
        const rail = new THREE.BoxGeometry(length + 0.14, 0.12, 0.19);
        details.push(placeFacadePart(edge, rail, [length / 2, height + lift, 0.07], VISION_WHITE));
      }
    }
  });
  return combineFacade(surface, details);
}

function drawVisionUpperWindow(
  edge: FacadeEdge, quad: Quad, center: number, y: number, details: THREE.BufferGeometry[],
) {
  const left = center - 0.78;
  const divider = left + 0.38;
  const right = center + 0.78;
  const bottom = y - 0.54;
  const top = y + 0.54;
  drawWindow(quad, left, divider, bottom, top, 0.05, VISION_WHITE, VISION_OPENING);
  drawWindow(quad, divider, right, bottom, top, 0.05, VISION_WHITE, VISION_TOWER_GLASS);

  // Swing the narrow sash outward around its left edge.
  const sashWidth = 0.30;
  const sash = new THREE.BoxGeometry(sashWidth, 0.98, 0.04);
  const pane = new THREE.BoxGeometry(sashWidth - 0.075, 0.90, 0.045);
  for (const [part, color] of [[sash, VISION_WHITE], [pane, VISION_SASH_GLASS]] as const) {
    part.translate(sashWidth / 2, 0, 0);
    part.rotateY(-Math.PI / 4);
    details.push(placeFacadePart(edge, part, [left + 0.045, y, 0.082], color));
  }
}

function makeScienceFacade(outline: Point[], height: number, floorIndex: number, topFloor: boolean) {
  return makeFacade(outline, ({start, dx, dz, length, nx, quad}) => {
    const centerX = start[0] + dx * length / 2;
    const centerZ = start[1] + dz * length / 2;
    // The shaft is the existing two-face projection at the courtyard bend.
    if (length < 3.2 && Math.hypot(centerX - 27.8, centerZ - 179.1) < 1.65) {
      const glass = nx > 0.8 ? ELEVATOR_GLASS : ELEVATOR_SIDE_GLASS;
      drawWindow(quad, 0.025, length - 0.025, 0.035, height - 0.035, 0.085, SCIENCE_FRAME, glass, true);
      return;
    }

    if (topFloor) {
      quad(0, length, height - 0.15, height, SCIENCE_SILL);
    }
    if (length < 5.5) return;

    const count = Math.max(1, Math.round(length / 3.85));
    const width = length / count;
    const bottom = height * 0.37;
    const top = height * 0.82;
    for (let bay = 0; bay < count; bay++) {
      const left = (bay + 0.105) * width;
      const right = (bay + 0.895) * width;
      if (floorIndex < 2) {
        quad(left, right, height * 0.035, bottom - 0.065, SCIENCE_BRICK);
      }
      quad(left - 0.06, right + 0.06, bottom - 0.065, bottom, SCIENCE_SILL);
      drawWindow(quad, left, right, bottom, top, 0.08, SCIENCE_FRAME, SCIENCE_GLASS, true);
    }
  });
}

function makeStudentUnionFacade(outline: Point[], height: number, floorIndex: number, topFloor: boolean) {
  const details: THREE.BufferGeometry[] = [];
  const surface = makeFacade(outline, ({quad, ...edge}) => {
    const { length, nx } = edge;
    const front = nx < -0.9;
    const bays = Math.max(1, Math.round(length / 1.75));
    const width = length / bays;
    const edgeBays = Math.round(bays * 0.17);
    const depth = 1.25;

    if (front) {
      // The two glazed sides and the roof band frame the recessed center.
      const wing = edgeBays * width;
      const spans: [number, number][] = topFloor ? [[0, length]] : [[0, wing], [length - wing, length]];
      for (const [left, right] of spans) {
        const backing = new THREE.BoxGeometry(right - left, height, depth);
        details.push(placeFacadePart(edge, backing, [(left + right) / 2, height / 2, depth / 2], STUDENT_UNION_SHADOW));
      }
    }

    for (let i = 0; i < bays; i++) {
      const recessed = front && !topFloor && i >= edgeBays && i < bays - edgeBays;
      const offset = front && !recessed ? depth : 0;
      const panel: Quad = (left, right, low, high, color) => quad(left, right, low, high, color, offset);
      const palette = recessed ? STUDENT_UNION_RECESS_GLASS : STUDENT_UNION_GLASS;
      const pane = palette[(i * 2 + floorIndex) % palette.length]!;
      const left = i * width + 0.018;
      const right = (i + 1) * width - 0.018;
      const rail = height * (topFloor && front ? 0.51 : 0.73);
      drawWindow(panel, left, right, 0.025, rail, 0.052, STUDENT_UNION_FRAME, pane);
      drawWindow(panel, left, right, rail, height - 0.025, 0.052, STUDENT_UNION_FRAME, palette[(i + 1) % palette.length]!);
    }
  });
  return combineFacade(surface, details);
}

function makeTheologyFacade(outline: Point[], height: number, floorIndex: number, topFloor: boolean) {
  const details: THREE.BufferGeometry[] = [];
  const surface = makeFacade(outline, ({quad, ...edge}) => {
    const { length, nz } = edge;
    if (Math.abs(nz) < 0.8) {
      quad(0, length, 0, height, THEOLOGY_BRICK);
      return;
    }

    // The front faces the campus interior, with the parking side behind it.
    const front = nz < 0;
    const stone = front ? THEOLOGY_FRONT : THEOLOGY_REAR;
    const brickEnd = length * 0.065;
    quad(0, brickEnd, 0, height, THEOLOGY_BRICK);
    quad(length - brickEnd, length, 0, height, THEOLOGY_BRICK);
    quad(brickEnd, length - brickEnd, 0, height, stone);

    const width = length - 2 * brickEnd;
    const bays = Math.max(1, Math.round(width / 4.75));
    const spacing = width / bays;
    const raised: Quad = (l, r, low, high, color) => quad(l, r, low, high, color, 0.025);
    for (let i = 0; i <= bays; i++) {
      const along = brickEnd + i * spacing;
      const column = new THREE.CylinderGeometry(0.19, 0.19, height, 10);
      details.push(placeFacadePart(edge, column, [along, height / 2, 0.14], stone));
      if (i === bays) break;
      const pane = THEOLOGY_GLASS[(i + floorIndex * 2) % THEOLOGY_GLASS.length]!;
      const left = along + 0.38;
      const right = along + spacing - 0.38;
      drawWindow(raised, left, right, height * 0.30, height * 0.68, 0.075, THEOLOGY_FRAME, pane, true);
      drawWindow(raised, left, right, height * 0.68, height * 0.82, 0.055, THEOLOGY_FRAME, pane, true);
    }

    if (topFloor) {
      const cornice = new THREE.BoxGeometry(width + 0.48, 0.26, 0.85);
      details.push(placeFacadePart(edge, cornice, [length / 2, height + 0.08, 0.29], stone));
      if (!front) {
        const railing = new THREE.BoxGeometry(width, 0.075, 0.075);
        details.push(placeFacadePart(edge, railing, [length / 2, height + 0.64, 0.36], THEOLOGY_FRAME));
        const posts = Math.ceil(width / 1.05);
        for (let i = 0; i <= posts; i++) {
          const post = new THREE.BoxGeometry(0.055, 0.48, 0.055);
          details.push(placeFacadePart(edge, post, [brickEnd + i * width / posts, height + 0.40, 0.36], stone));
        }
      }
    }
  });
  return combineFacade(surface, details);
}

function makeVisionHallFacade(outline: Point[], height: number, floorIndex: number, topFloor: boolean) {
  const details: THREE.BufferGeometry[] = [];
  const surface = makeFacade(outline, ({quad, ...edge}) => {
    const { length, nx, nz } = edge;
    const bays = Math.max(1, Math.round(length / 6.7));
    const width = length / bays;
    const front = length > 30 && nx < -0.7 && nz > 0.5;
    const rear = length > 30 && nx > 0.7 && nz < -0.5;
    const towerBays = front || rear ? [Math.floor(bays * 0.26), Math.floor(bays * 0.84)] : [];
    const infill = rear ? VISION_HALL_REAR_INFILL : VISION_HALL_INFILL;
    if (rear) {
      quad(0, length, 0, height, VISION_HALL_REAR_WALL, -0.02);
    }
    if (length < 30 && nz < -0.7) {
      details.push(...makeVisionHallElevator(edge, height, topFloor));
    }

    for (let i = 0; i < bays; i++) {
      const center = (i + 0.5) * width;
      const towerBay = towerBays.includes(i);
      if (towerBay) {
        const tower = new THREE.BoxGeometry(width * 0.71, height, 0.35);
        details.push(placeFacadePart(edge, tower, [center, height / 2, 0.14], infill));
        if (floorIndex > 0) {
          const low = 0.065;
          const high = height - 0.065;
          quad(center - 0.92, center + 0.92, low, high, VISION_HALL_FRAME, 0.29);
          for (const side of [-1, 1]) {
            const paneCenter = center + side * 0.70;
            for (let row = 0; row < 5; row++) {
              const y = low + row * (high - low) / 5;
              quad(paneCenter - 0.14, paneCenter + 0.14, y + 0.025,
                y + (high - low) / 5 - 0.025, VISION_HALL_PANES[(row + floorIndex) % 3]!, 0.31);
            }
          }
          const blockSize = (high - low) / 12;
          for (let row = 0; row < 12; row++) {
            for (let column = 0; column < 3; column++) {
              const left = center - 0.51 + column * 0.34;
              const bottom = low + row * blockSize;
              const color = VISION_HALL_BLOCKS[(row * 2 + column) % 3]!;
              quad(left + 0.012, left + 0.328, bottom + 0.012, bottom + blockSize - 0.012, color, 0.31);
            }
          }
          continue;
        }
      }

      const halfWindow = Math.min(1.56, width * 0.29);
      const left = center - halfWindow;
      const right = center + halfWindow;
      const window: Quad = (l, r, bottom, top, color) => quad(l, r, bottom, top, color, towerBay ? 0.29 : 0.025);
      const glass = VISION_HALL_PANES[(i + floorIndex) % 3]!;
      quad(left, right, 0, height, infill);
      drawWindow(window, left, right, height * 0.24, height * 0.37, 0.065, VISION_HALL_FRAME, VISION_HALL_PANES[0]!, true);
      drawWindow(window, left, right, height * 0.37, height * 0.86, 0.065, VISION_HALL_FRAME, glass);
      if (topFloor) {
        window(left - 0.08, right + 0.08, height * 0.86, height * 0.895, VISION_HALL_LINTEL);
      }
    }
  });
  return combineFacade(surface, details);
}

function makeVisionHallElevator(edge: FacadeEdge, height: number, topFloor: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const width = 2.2;
  const depth = 2.05;
  const along = edge.length / 2;
  const outward = depth / 2 - 0.12;
  const add = (size: [number, number, number], u: number, y: number, v: number, color: THREE.Color) => {
    parts.push(placeFacadePart(edge, new THREE.BoxGeometry(...size), [along + u, y, outward + v], color));
  };

  add([width, height, depth], 0, height / 2, 0, VISION_HALL_FRAME);
  for (const u of [-width / 4, width / 4]) {
    add([width / 2 - 0.09, height - 0.14, 0.035], u, height / 2, depth / 2, ELEVATOR_GLASS);
  }
  add([0.035, height - 0.14, depth - 0.12], width / 2, height / 2, 0, ELEVATOR_SIDE_GLASS);
  add([width - 0.09, height - 0.14, 0.035], 0, height / 2, -depth / 2, ELEVATOR_SIDE_GLASS);
  if (topFloor) {
    add([width + 0.12, 0.15, depth + 0.12], 0, height + 0.055, 0, VISION_HALL_FRAME);
  }
  return parts;
}

export function makeBuildingFacade(
  outline: Point[], height: number, buildingId: string, floorIndex: number, topFloor: boolean,
) {
  if (buildingId === 'main') return makeMainWindows(outline, height, floorIndex === 0, topFloor);
  if (buildingId === 'gemi') return makeGemiFacade(outline, height, floorIndex, topFloor);
  if (buildingId === 'music') return makeMusicFacade(outline, height, floorIndex, topFloor);
  if (buildingId === 'rodem') return makeRodemFacade(outline, height, topFloor);
  if (buildingId === 'vision_center') return makeVisionCenterFacade(outline, height, floorIndex, topFloor);
  if (buildingId === 'science') return makeScienceFacade(outline, height, floorIndex, topFloor);
  if (buildingId === 'student_union') return makeStudentUnionFacade(outline, height, floorIndex, topFloor);
  if (buildingId === 'theology') return makeTheologyFacade(outline, height, floorIndex, topFloor);
  if (buildingId === 'vision') return makeVisionHallFacade(outline, height, floorIndex, topFloor);
  if (BUILDING_COLORS[buildingId] === TWIN_COLORS) return makeTwinFacade(outline, height, floorIndex);
  return null;
}
