import type { PathEdge, PathGraph, PathNode, RouteRequest } from '../../types/generated/campus';

export type RouteProfile = NonNullable<RouteRequest['profile']>;

/**
 * 간선 종류별 비용 가중치 (안내 모드별). Infinity면 그 간선은 쓰지 않는다.
 * 서버 엔진(backend/campus/routing/engine.py)과 같은 방향으로 맞춰 둔다.
 */
const KIND_COST: Record<RouteProfile, Record<PathEdge['kind'], number>> = {
  recommended: { walk: 1, road: 1.04, stairs: 1.8 },
  walkway: { walk: 1, road: 1.66, stairs: 1.8 },
  accessible: { walk: 1, road: 1.04, stairs: Infinity },
};

export type Vec3 = [number, number, number];

export interface PathResult {
  nodeIds: string[];
  points: Vec3[];
  /** 실제 이동 거리 (m) */
  length: number;
}

interface Neighbor {
  to: string;
  kind: PathEdge['kind'];
  length: number;
}

/** 보행로 그래프 위의 A* 길찾기 */
export class Router {
  readonly nodes = new Map<string, PathNode>();
  private readonly adj = new Map<string, Neighbor[]>();

  constructor(graph: PathGraph) {
    for (const n of graph.nodes) {
      this.nodes.set(n.id, n);
      this.adj.set(n.id, []);
    }
    for (const e of graph.edges) {
      this.adj.get(e.a)?.push({ to: e.b, kind: e.kind, length: e.length });
      this.adj.get(e.b)?.push({ to: e.a, kind: e.kind, length: e.length });
    }
  }

  private h(a: string, b: string): number {
    const p = this.nodes.get(a)!;
    const q = this.nodes.get(b)!;
    return Math.hypot(p.x - q.x, p.z - q.z);
  }

  find(start: string, goal: string, profile: RouteProfile = 'recommended'): PathResult | null {
    if (!this.nodes.has(start) || !this.nodes.has(goal)) return null;
    const weights = KIND_COST[profile];

    const g = new Map<string, number>([[start, 0]]);
    const dist = new Map<string, number>([[start, 0]]);
    const came = new Map<string, string>();
    const open = new MinHeap();
    open.push(start, this.h(start, goal));
    const closed = new Set<string>();

    while (open.size) {
      const cur = open.pop()!;
      if (cur === goal) return this.reconstruct(came, goal, dist.get(goal)!);
      if (closed.has(cur)) continue;
      closed.add(cur);

      for (const nb of this.adj.get(cur) ?? []) {
        const step = nb.length * weights[nb.kind];
        if (!Number.isFinite(step)) continue;
        const tentative = g.get(cur)! + step;
        if (tentative < (g.get(nb.to) ?? Infinity)) {
          g.set(nb.to, tentative);
          dist.set(nb.to, dist.get(cur)! + nb.length);
          came.set(nb.to, cur);
          open.push(nb.to, tentative + this.h(nb.to, goal));
        }
      }
    }
    return null;
  }

  private reconstruct(came: Map<string, string>, goal: string, length: number): PathResult {
    const ids = [goal];
    let cur = goal;
    while (came.has(cur)) {
      cur = came.get(cur)!;
      ids.push(cur);
    }
    ids.reverse();
    const points = ids.map((id): Vec3 => {
      const n = this.nodes.get(id)!;
      return [n.x, n.y, n.z];
    });
    return { nodeIds: ids, points, length: Math.round(length) };
  }
}

/** 작은 이진 힙 (우선순위 큐) */
class MinHeap {
  private items: { key: string; f: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(key: string, f: number) {
    const a = this.items;
    a.push({ key, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.f <= a[i]!.f) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }

  pop(): string | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.f < a[m]!.f) m = l;
        if (r < a.length && a[r]!.f < a[m]!.f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top?.key;
  }
}
