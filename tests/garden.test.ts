import { describe, expect, it } from 'vitest';
import { applyReview, createFsrsCard, introduceCard } from '../src/core/fsrs';
import { gardenStats, plantOf, plantStage, stageSnapshot } from '../src/core/garden';
import type { StudyCard } from '../src/core/types';

const T0 = new Date('2026-10-12T00:00:00Z');
const DAY = 24 * 3600 * 1000;

function card(id: string, opts: Partial<StudyCard> = {}): StudyCard {
  return {
    id,
    ja: '',
    readings: [''],
    ko: '',
    situation: '',
    theme: 'konbini',
    grammarTags: [],
    source: 'deck',
    fsrs: createFsrsCard(T0),
    introducedAt: null,
    ...opts,
  };
}

describe('plantStage', () => {
  it('안정도 기준 씨앗·새싹·잎·꽃', () => {
    expect(plantStage(0.3)).toBe(0);
    expect(plantStage(1)).toBe(1);
    expect(plantStage(6.9)).toBe(1);
    expect(plantStage(7)).toBe(2);
    expect(plantStage(21)).toBe(3);
  });
});

describe('plantOf', () => {
  it('안 배운 카드는 식물이 없다', () => {
    expect(plantOf(card('a'), T0)).toBeNull();
  });

  it('막 배운 카드는 시들지 않은 씨앗', () => {
    const p = plantOf(introduceCard(card('a'), T0), T0)!;
    expect(p).toMatchObject({ stage: 0, wilted: false, special: false });
  });

  it('복습 시기가 한참 지나면 시든다', () => {
    let c = introduceCard(card('a'), T0);
    for (let i = 0; i < 3; i++) c = applyReview(c, 'good', c.fsrs.due).card;
    const at = c.fsrs.due.getTime();
    expect(plantOf(c, new Date(at - DAY))!.wilted).toBe(false);
    expect(plantOf(c, new Date(at + 60 * DAY))!.wilted).toBe(true);
  });

  it('수집함 카드는 특별한 꽃', () => {
    expect(plantOf(introduceCard(card('m', { source: 'mined' }), T0), T0)!.special).toBe(true);
  });
});

describe('gardenStats / stageSnapshot', () => {
  it('배운 카드만 센다', () => {
    const learned = introduceCard(card('a'), T0);
    const strong = { ...introduceCard(card('b'), T0), fsrs: { ...createFsrsCard(T0), stability: 30, reps: 5, last_review: T0 } };
    const stats = gardenStats([learned, strong, card('c')], T0);
    expect(stats.plants).toBe(2);
    expect(stats.byStage).toEqual({ 0: 1, 1: 0, 2: 0, 3: 1 });
    expect(stageSnapshot([learned, strong, card('c')])).toEqual({ a: 0, b: 3 });
  });
});
