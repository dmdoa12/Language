import { createRng, pick, randInt, shuffle, type Rng } from './rng';
import type { MapNode, NodeType, StudyCard, Theme } from './types';

export const CARDS_PER_FLOOR_TARGET = 7;
export const MIN_FLOORS = 4;
export const MAX_FLOORS = 15;
export const BOSS_MAX_CARDS = 8;
export const ELITE_EXTRA_CARDS = 2;
export const LEECH_LAPSES = 4;

export interface MapGenInput {
  due: readonly StudyCard[]; //   retrievability 오름차순 정렬된 오늘 due 카드
  leeches: readonly StudyCard[]; // lapses >= 4 인 도입된 카드 (due 여부 무관)
  seed: string;
}

export interface GeneratedMap {
  nodes: MapNode[];
  mainTheme: Theme | null;
}

export function isLeech(card: StudyCard): boolean {
  return card.introducedAt !== null && card.fsrs.lapses >= LEECH_LAPSES;
}

// 층 수 = ceil(due / 7) + 2 (상점·보스 포함), 4~15층.
export function floorCount(dueCount: number): number {
  return Math.min(MAX_FLOORS, Math.max(MIN_FLOORS, Math.ceil(dueCount / CARDS_PER_FLOOR_TARGET) + 2));
}

// due 가 가장 많은 테마. 동률이면 먼저 나온(더 잊기 쉬운) 카드의 테마.
export function pickMainTheme(due: readonly StudyCard[]): Theme | null {
  const counts = new Map<Theme, number>();
  for (const c of due) counts.set(c.theme, (counts.get(c.theme) ?? 0) + 1);
  let best: Theme | null = null;
  let bestCount = 0;
  for (const [theme, count] of counts) {
    if (count > bestCount) {
      best = theme;
      bestCount = count;
    }
  }
  return best;
}

// 순서를 유지한 채 n 개 덩어리로 균등 분할 (앞쪽이 1장 더 많을 수 있음).
export function splitEvenly<T>(items: readonly T[], n: number): T[][] {
  if (n <= 0) return [];
  const base = Math.floor(items.length / n);
  const extra = items.length % n;
  const out: T[][] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const size = base + (k < extra ? 1 : 0);
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out;
}

function makeNode(floor: number, index: number, type: NodeType, cardIds: string[]): MapNode {
  return {
    id: `f${floor}n${index}`,
    floor,
    type,
    cardIds,
    extraCardIds: [],
    answeredCardIds: [],
    earnedGold: 0,
    next: [],
    cleared: false,
  };
}

function pickNodeTypes(rng: Rng, count: number, eliteAvailable: boolean): NodeType[] {
  const pool: NodeType[] = eliteAvailable
    ? ['battle', 'battle', 'elite', 'rest', 'event']
    : ['battle', 'battle', 'rest', 'event'];
  const types: NodeType[] = ['battle']; // 각 층에 일반 전투 하나는 보장
  while (types.length < count) types.push(pick(rng, pool)!);
  return shuffle(rng, types);
}

// 인접 층 연결: 모든 노드는 다음 층으로 1개 이상, 다음 층 노드는 들어오는 간선 1개 이상.
function connect(rng: Rng, from: MapNode[], to: MapNode[]): void {
  const a = from.length;
  const b = to.length;
  const incoming = new Set<number>();
  from.forEach((node, i) => {
    const j = a === 1 ? 0 : Math.round((i * (b - 1)) / (a - 1));
    const targets = new Set([j]);
    if (b > 1 && rng() < 0.35) targets.add(Math.min(b - 1, Math.max(0, j + (rng() < 0.5 ? -1 : 1))));
    for (const t of targets) {
      node.next.push(to[t]!.id);
      incoming.add(t);
    }
  });
  to.forEach((target, j) => {
    if (incoming.has(j)) return;
    const i = b === 1 ? 0 : Math.round((j * (a - 1)) / (b - 1));
    from[i]!.next.push(target.id);
  });
  for (const node of from) node.next.sort();
}

export function generateMap({ due, leeches, seed }: MapGenInput): GeneratedMap {
  const rng = createRng(seed);

  // 보스: 메인 테마 due 카드 (최대 8장, 정렬상 뒤쪽 = 상대적으로 기억이 잘 된 것).
  const mainTheme = pickMainTheme(due);
  const bossIds = new Set(
    due
      .filter((c) => c.theme === mainTheme)
      .slice(-BOSS_MAX_CARDS)
      .map((c) => c.id),
  );
  const rest = due.filter((c) => !bossIds.has(c.id));

  // 일반 층: 공식상 층 수 - 2 (상점·보스). 카드 0장인 층은 만들지 않는다.
  const normalFloors = Math.min(floorCount(due.length) - 2, rest.length);
  const batches = splitEvenly(rest, normalFloors).map((b) => b.map((c) => c.id));

  const dueIds = new Set(due.map((c) => c.id));
  const leechPool = leeches.filter((c) => !dueIds.has(c.id)).map((c) => c.id);

  // 상점은 일반 층 절반을 지난 직후 (전체 폭 고정 층).
  const shopAfter = Math.ceil(batches.length / 2);
  const floors: MapNode[][] = [];
  let floor = 0;
  const pushNormal = (batch: string[]) => {
    const count = randInt(rng, 2, 3);
    const types = pickNodeTypes(rng, count, leechPool.length > 0);
    floors.push(
      types.map((type, i) => {
        const node = makeNode(floor, i, type, [...batch]);
        if (type === 'elite') node.extraCardIds = shuffle(rng, leechPool).slice(0, ELITE_EXTRA_CARDS);
        return node;
      }),
    );
    floor++;
  };

  if (shopAfter === 0) floors.push([makeNode(floor++, 0, 'shop', [])]);
  batches.forEach((batch, i) => {
    pushNormal(batch);
    if (i + 1 === shopAfter) floors.push([makeNode(floor++, 0, 'shop', [])]);
  });
  const bossCardIds = due.filter((c) => bossIds.has(c.id)).map((c) => c.id);
  floors.push([makeNode(floor, 0, 'boss', bossCardIds)]);

  for (let f = 0; f < floors.length - 1; f++) connect(rng, floors[f]!, floors[f + 1]!);

  return { nodes: floors.flat(), mainTheme };
}

// 시작 층부터 보스까지 가능한 모든 경로 (테스트·검증용).
export function enumeratePaths(nodes: readonly MapNode[]): MapNode[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const starts = nodes.filter((n) => n.floor === 0);
  const paths: MapNode[][] = [];
  const walk = (node: MapNode, acc: MapNode[]) => {
    const path = [...acc, node];
    if (node.next.length === 0) {
      paths.push(path);
      return;
    }
    for (const id of node.next) walk(byId.get(id)!, path);
  };
  for (const s of starts) walk(s, []);
  return paths;
}
