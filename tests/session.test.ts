import { describe, expect, it } from 'vitest';
import { applyReview, createFsrsCard, introduceCard } from '../src/core/fsrs';
import { buildHint, countDueBy, pickNextStep, planRun, summarizeToday } from '../src/core/session';
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

describe('pickNextStep allowNew=false', () => {
  it('신규 카드를 내지 않는다', () => {
    expect(pickNextStep([makeCard('n1')], profile, T0, { allowNew: false })).toEqual({
      kind: 'done',
      nextDueAt: null,
    });
  });
});

describe('planRun', () => {
  it('오늘 첫 런은 정상, 두 번째부터 연습. seed 는 날짜와 회차', () => {
    const cards = [introduceCard(makeCard('a'), T0), { ...introduceCard(makeCard('l'), T0), fsrs: { ...introduceCard(makeCard('l'), T0).fsrs, lapses: 5 } }];
    const first = planRun(cards, [], T0);
    expect(first).toMatchObject({ date: '2026-10-12', seed: '2026-10-12#1', practice: false });
    expect(first.due.map((c) => c.id).sort()).toEqual(['a', 'l']);
    expect(first.leeches.map((c) => c.id)).toEqual(['l']);
    const second = planRun(cards, [{ date: '2026-10-12' }, { date: '2026-10-11' }], T0);
    expect(second).toMatchObject({ seed: '2026-10-12#2', practice: true });
  });
});

describe('countDueBy', () => {
  it('해당 날짜까지 due 인 도입 카드 수', () => {
    const a = introduceCard(makeCard('a'), T0);
    const later = applyReview(applyReview(introduceCard(makeCard('b'), T0), 'good', T0).card, 'good', T0).card;
    expect(countDueBy([a, later, makeCard('n')], '2026-10-12')).toBe(1);
    expect(countDueBy([a, later], '2099-01-01')).toBe(2);
  });
});
