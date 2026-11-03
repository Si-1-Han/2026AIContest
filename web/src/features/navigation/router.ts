import type { PathEdge, PathGraph, PathNode } from '../../types/generated/campus';

/** 간선 종류별 비용 가중치. 계단은 실제 거리보다 멀게 느껴지도록 한다. */
const KIND_COST: Record<PathEdge['kind'], number> = { walk: 1, road: 1.15, stairs: 1.6 };

export type Vec3 = [number, number, number];

export interface PathResult {
  nodeIds: string[];
  points: Vec3[];
  /** 실제 이동 거리 (m) */
  length: number;
}

interface Neighbor {
  to: string;
  cost: number;
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
      const cost = e.length * KIND_COST[e.kind];
      this.adj.get(e.a)?.push({ to: e.b, cost, length: e.length });
      this.adj.get(e.b)?.push({ to: e.a, cost, length: e.length });
    }
  }

  private h(a: string, b: string): number {
    const p = this.nodes.get(a)!;
    const q = this.nodes.get(b)!;
    return Math.hypot(p.x - q.x, p.z - q.z);
  }

  find(start: string, goal: string): PathResult | null {
    if (!this.nodes.has(start) || !this.nodes.has(goal)) return null;

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
        const tentative = g.get(cur)! + nb.cost;
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
