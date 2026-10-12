import { describe, expect, it } from 'vitest';
import { applyReview, createFsrsCard, introduceCard } from '../src/core/fsrs';
import { buildHint, pickNextStep, summarizeToday } from '../src/core/session';
import type { StudyCard } from '../src/core/types';

const T0 = new Date('2026-10-12T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const profile = { unlockedThemes: ['konbini' as const], dailyNewLimit: 2 };

function makeCard(id: string): StudyCard {
  return {
    id,
    ja: 'はい。',
    readings: ['いらっしゃいませ'],
    ko: '',
    situation: '',
    theme: 'konbini',
    grammarTags: [],
    source: 'deck',
    fsrs: createFsrsCard(T0),
    introducedAt: null,
  };
}

describe('pickNextStep', () => {
  it('due 카드가 있으면 신규보다 먼저 낸다', () => {
    const cards = [makeCard('n1'), introduceCard(makeCard('d1'), T0)];
    const step = pickNextStep(cards, profile, T0);
    expect(step.kind).toBe('review');
    expect(step.kind === 'review' && step.card.id).toBe('d1');
  });

  it('곧 due 인 학습 단계 카드보다 신규 카드를 먼저 낸다', () => {
    const failed = applyReview(introduceCard(makeCard('f'), T0), 'again', T0).card;
    expect(failed.fsrs.due.getTime()).toBeGreaterThan(T0.getTime());
    const withNew = pickNextStep([failed, makeCard('n1')], profile, T0);
    expect(withNew.kind === 'new' && withNew.card.id).toBe('n1');
    const onlyFailed = pickNextStep([failed], profile, T0);
    expect(onlyFailed.kind === 'review' && onlyFailed.card.id).toBe('f');
  });

  it('due 가 없으면 신규 카드를 낸다', () => {
    const step = pickNextStep([makeCard('n1'), makeCard('n2')], profile, T0);
    expect(step.kind === 'new' && step.card.id).toBe('n1');
  });

  it('오늘 한도를 다 쓰면 done 과 가장 이른 다음 due 를 돌려준다', () => {
    const graduate = (id: string) => {
      let c = introduceCard(makeCard(id), T0);
      for (let i = 0; i < 3; i++) c = applyReview(c, 'good', T0).card;
      return c;
    };
    const a = graduate('a');
    const b = graduate('b');
    const step = pickNextStep([a, b, makeCard('n1')], profile, T0);
    expect(step.kind).toBe('done');
    expect(step.kind === 'done' && step.nextDueAt).toBe(
      Math.min(a.fsrs.due.getTime(), b.fsrs.due.getTime()),
    );
  });

  it('아무것도 배우지 않았고 신규도 없으면 nextDueAt 은 null', () => {
    expect(pickNextStep([], profile, T0)).toEqual({ kind: 'done', nextDueAt: null });
  });

  it('다음 날이 되면 신규 한도가 다시 열린다', () => {
    const cards = [introduceCard(makeCard('a'), T0), introduceCard(makeCard('b'), T0), makeCard('n')];
    const reviewed = cards.map((c) =>
      c.introducedAt === null ? c : applyReview(applyReview(c, 'good', T0).card, 'good', T0).card,
    );
    const tomorrow = new Date(T0.getTime() + DAY);
    expect(summarizeToday(reviewed, profile, T0).newAvailable).toBe(0);
    expect(summarizeToday(reviewed, profile, tomorrow).newAvailable).toBe(1);
  });
});

describe('buildHint', () => {
  it('첫 reading 의 앞 1/3 을 보여준다', () => {
    expect(buildHint({ readings: ['いらっしゃいませ'] })).toBe('いらっ…');
    expect(buildHint({ readings: ['はい'] })).toBe('は…');
  });
});
