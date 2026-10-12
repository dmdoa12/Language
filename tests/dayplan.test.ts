import { describe, expect, it } from 'vitest';
import { allLines, MAX_LINES_PER_SCENE, planDay } from '../src/core/dayplan';
import { createFsrsCard } from '../src/core/fsrs';
import type { StudyCard, Theme } from '../src/core/types';

const T0 = new Date('2026-10-12T00:00:00Z');

function card(id: string, theme: Theme, introduced = true): StudyCard {
  return {
    id,
    ja: '',
    readings: [''],
    ko: '',
    situation: '',
    theme,
    grammarTags: [],
    source: 'deck',
    fsrs: createFsrsCard(T0),
    introducedAt: introduced ? T0.getTime() : null,
  };
}

function cards(n: number, themes: Theme[], prefix: string, introduced = true): StudyCard[] {
  return Array.from({ length: n }, (_, i) => card(`${prefix}${i}`, themes[i % themes.length]!, introduced));
}

describe('planDay', () => {
  const cases: Array<[number, number, Theme[]]> = [
    [0, 0, ['konbini']],
    [0, 5, ['konbini']],
    [1, 0, ['konbini']],
    [7, 3, ['konbini', 'cafe']],
    [20, 15, ['konbini', 'cafe', 'restaurant']],
    [130, 10, ['konbini', 'cafe', 'smalltalk', 'consult']],
  ];

  for (const [nDue, nNew, themes] of cases) {
    it(`필수: due ${nDue}장은 정확히 한 번씩, 신규 ${nNew}장도 한 번씩 등장`, () => {
      const due = cards(nDue, themes, 'd');
      const fresh = cards(nNew, themes, 'n', false);
      const lines = allLines(planDay({ due, fresh }));
      const dueIds = lines.filter((l) => !l.isNew).map((l) => l.cardId).sort();
      const newIds = lines.filter((l) => l.isNew).map((l) => l.cardId).sort();
      expect(dueIds).toEqual(due.map((c) => c.id).sort());
      expect(newIds).toEqual(fresh.map((c) => c.id).sort());
      expect(new Set(lines.map((l) => l.cardId)).size).toBe(lines.length);
    });
  }

  it('장소는 THEME_ORDER 순서, 같은 장소에서는 due(입력 순) 뒤에 신규', () => {
    const due = [card('c1', 'cafe'), card('k1', 'konbini'), card('k2', 'konbini')];
    const fresh = [card('kn', 'konbini', false), card('cn', 'cafe', false)];
    const scenes = planDay({ due, fresh });
    expect(scenes.map((s) => s.theme)).toEqual(['konbini', 'cafe']);
    expect(scenes[0]!.lines.map((l) => l.cardId)).toEqual(['k1', 'k2', 'kn']);
    expect(scenes[1]!.lines.map((l) => l.cardId)).toEqual(['c1', 'cn']);
  });

  it('한 장면 최대 8줄, 넘으면 균등하게 나누고 part/parts 표시', () => {
    const scenes = planDay({ due: cards(19, ['konbini'], 'd'), fresh: [] });
    expect(scenes.map((s) => s.lines.length)).toEqual([7, 6, 6]);
    expect(scenes.map((s) => [s.part, s.parts])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    for (const s of scenes) expect(s.lines.length).toBeLessThanOrEqual(MAX_LINES_PER_SCENE);
    expect(new Set(scenes.map((s) => s.id)).size).toBe(3);
  });

  it('결정적: 같은 입력 → 같은 하루', () => {
    const input = { due: cards(30, ['konbini', 'cafe'], 'd'), fresh: cards(5, ['cafe'], 'n', false) };
    expect(planDay(input)).toEqual(planDay(input));
  });

  it('할 것이 없으면 빈 하루', () => {
    expect(planDay({ due: [], fresh: [] })).toEqual([]);
  });
});
