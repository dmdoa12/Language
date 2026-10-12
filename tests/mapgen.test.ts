import { describe, expect, it } from 'vitest';
import { createFsrsCard } from '../src/core/fsrs';
import {
  enumeratePaths,
  floorCount,
  generateMap,
  isLeech,
  pickMainTheme,
  splitEvenly,
} from '../src/core/mapgen';
import type { MapNode, StudyCard, Theme } from '../src/core/types';

const T0 = new Date('2026-10-12T00:00:00Z');

function card(id: string, theme: Theme = 'konbini', lapses = 0): StudyCard {
  return {
    id,
    ja: '',
    readings: [''],
    ko: '',
    situation: '',
    theme,
    grammarTags: [],
    source: 'deck',
    fsrs: { ...createFsrsCard(T0), lapses },
    introducedAt: T0.getTime(),
  };
}

function dueCards(n: number, themes: Theme[] = ['konbini']): StudyCard[] {
  return Array.from({ length: n }, (_, i) => card(`c${i}`, themes[i % themes.length]!));
}

function cardsOnPath(path: MapNode[]): string[] {
  return path.flatMap((n) => n.cardIds);
}

describe('floorCount', () => {
  it('ceil(due/7)+2, 최소 4 최대 15', () => {
    expect(floorCount(0)).toBe(4);
    expect(floorCount(7)).toBe(4);
    expect(floorCount(15)).toBe(5);
    expect(floorCount(70)).toBe(12);
    expect(floorCount(500)).toBe(15);
  });
});

describe('splitEvenly', () => {
  it('순서를 유지하고 크기 차이는 최대 1', () => {
    expect(splitEvenly([1, 2, 3, 4, 5], 2)).toEqual([[1, 2, 3], [4, 5]]);
    expect(splitEvenly([], 0)).toEqual([]);
  });
});

describe('pickMainTheme', () => {
  it('due 가 가장 많은 테마', () => {
    const due = [card('a', 'cafe'), card('b', 'konbini'), card('c', 'konbini')];
    expect(pickMainTheme(due)).toBe('konbini');
    expect(pickMainTheme([])).toBeNull();
  });
});

describe('isLeech', () => {
  it('lapses 4 이상', () => {
    expect(isLeech(card('a', 'konbini', 4))).toBe(true);
    expect(isLeech(card('a', 'konbini', 3))).toBe(false);
  });
});

describe('generateMap', () => {
  const cases: Array<[number, Theme[]]> = [
    [0, ['konbini']],
    [1, ['konbini']],
    [3, ['konbini', 'cafe']],
    [7, ['konbini']],
    [20, ['konbini', 'cafe', 'restaurant']],
    [45, ['konbini', 'cafe']],
    [130, ['konbini', 'cafe', 'smalltalk']],
  ];

  for (const [n, themes] of cases) {
    for (const seed of ['2026-10-12#1', 'alpha', 'beta']) {
      it(`필수: due ${n}장 (seed ${seed}) 모든 경로에서 due 카드가 정확히 한 번씩 등장`, () => {
        const due = dueCards(n, themes);
        const leeches = [card('leech1', 'konbini', 5), card('leech2', 'cafe', 6), card('leech3', 'konbini', 4)];
        const { nodes } = generateMap({ due, leeches, seed });
        const paths = enumeratePaths(nodes);
        expect(paths.length).toBeGreaterThan(0);
        const expected = due.map((c) => c.id).sort();
        for (const path of paths) {
          expect(cardsOnPath(path).sort()).toEqual(expected);
          expect(path[0]!.floor).toBe(0);
          expect(path.at(-1)!.type).toBe('boss');
          expect(path.filter((nd) => nd.type === 'shop')).toHaveLength(1);
        }
      });
    }
  }

  it('같은 seed 면 같은 맵, 다른 seed 면 (대개) 다른 맵', () => {
    const due = dueCards(30, ['konbini', 'cafe']);
    const leeches = [card('l1', 'konbini', 5)];
    const a = generateMap({ due, leeches, seed: 's1' });
    const b = generateMap({ due, leeches, seed: 's1' });
    const c = generateMap({ due, leeches, seed: 's2' });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('층 수 공식을 지키고 상점·보스는 전체 폭 1노드, 일반 층은 2~3노드', () => {
    const due = dueCards(40, ['konbini']);
    const { nodes } = generateMap({ due, leeches: [], seed: 'x' });
    const floors = new Map<number, MapNode[]>();
    for (const nd of nodes) floors.set(nd.floor, [...(floors.get(nd.floor) ?? []), nd]);
    expect(floors.size).toBe(floorCount(40));
    for (const [, list] of floors) {
      const t = list[0]!.type;
      if (t === 'shop' || t === 'boss') expect(list).toHaveLength(1);
      else {
        expect(list.length).toBeGreaterThanOrEqual(2);
        expect(list.length).toBeLessThanOrEqual(3);
        // 같은 층 노드는 batch 가 같다
        for (const nd of list) expect(nd.cardIds).toEqual(list[0]!.cardIds);
      }
    }
  });

  it('due 가 적으면 카드 없는 층은 만들지 않는다', () => {
    const { nodes } = generateMap({ due: dueCards(1), leeches: [], seed: 'x' });
    for (const nd of nodes) {
      if (nd.type !== 'shop' && nd.type !== 'boss') expect(nd.cardIds.length).toBeGreaterThan(0);
    }
  });

  it('보스는 메인 테마 due 카드 (최대 8장)', () => {
    const due = dueCards(30, ['konbini', 'konbini', 'cafe']);
    const { nodes, mainTheme } = generateMap({ due, leeches: [], seed: 'x' });
    const boss = nodes.find((n) => n.type === 'boss')!;
    expect(mainTheme).toBe('konbini');
    expect(boss.cardIds.length).toBe(8);
    const byId = new Map(due.map((c) => [c.id, c]));
    for (const id of boss.cardIds) expect(byId.get(id)!.theme).toBe('konbini');
  });

  it('상점은 일반 층 절반 지점', () => {
    const { nodes } = generateMap({ due: dueCards(40), leeches: [], seed: 'x' });
    const shop = nodes.find((n) => n.type === 'shop')!;
    const boss = nodes.find((n) => n.type === 'boss')!;
    expect(shop.floor).toBeGreaterThan(0);
    expect(shop.floor).toBeLessThan(boss.floor);
  });

  it('엘리트는 due 가 아닌 리치 카드 최대 2장을 extraCardIds 로 받는다', () => {
    const due = dueCards(60);
    const dueLeech = card('c0', 'konbini', 9); // due 이면서 리치 → 엘리트 추가 후보에서 제외
    const leeches = [dueLeech, card('l1', 'konbini', 5), card('l2', 'konbini', 5), card('l3', 'konbini', 5)];
    let sawElite = false;
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const { nodes } = generateMap({ due, leeches, seed });
      for (const nd of nodes) {
        if (nd.type === 'elite') {
          sawElite = true;
          expect(nd.extraCardIds.length).toBe(2);
          expect(nd.extraCardIds).not.toContain('c0');
        } else {
          expect(nd.extraCardIds).toEqual([]);
        }
      }
    }
    expect(sawElite).toBe(true);
  });

  it('리치 카드가 없으면 엘리트 노드가 없다', () => {
    const { nodes } = generateMap({ due: dueCards(60), leeches: [], seed: 'a' });
    expect(nodes.some((n) => n.type === 'elite')).toBe(false);
  });
});
