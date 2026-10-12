import { describe, expect, it } from 'vitest';
import { applyReview, createFsrsCard, introduceCard, replayCard } from '../src/core/fsrs';
import { mergeSnapshots, type Snapshot } from '../src/core/sync';
import { DEFAULT_PROFILE, type DayLog, type ReviewLogEntry, type StudyCard, type StudyRating } from '../src/core/types';

const T0 = new Date('2026-10-12T00:00:00Z').getTime();
const H = 3600 * 1000;
const D = 24 * H;

function card(id: string): StudyCard {
  return {
    id,
    ja: id,
    readings: ['あ'],
    ko: id,
    situation: '',
    theme: 'konbini',
    grammarTags: [],
    source: 'deck',
    fsrs: createFsrsCard(new Date(T0)),
    introducedAt: null,
  };
}

// 실제 앱처럼 카드를 배우고 복습한 결과(카드 상태 + 로그)를 만든다
function study(c: StudyCard, introducedAt: number, reviews: Array<[number, StudyRating]>, idPrefix: string) {
  let cur = introduceCard(c, new Date(introducedAt));
  const logs: ReviewLogEntry[] = [];
  reviews.forEach(([at, rating], i) => {
    const { card, log } = applyReview(cur, rating, new Date(at));
    cur = card;
    logs.push({
      id: `${idPrefix}-${c.id}-${i}`,
      cardId: c.id,
      dayId: null,
      rating,
      input: '',
      hintUsed: false,
      elapsedMs: 0,
      answeredAt: at,
      fsrsLog: log,
    });
  });
  return { card: cur, logs };
}

function snap(cards: StudyCard[], logs: ReviewLogEntry[], extra: Partial<Snapshot> = {}): Snapshot {
  return { exportedAt: 0, cards, reviewLogs: logs, days: [], minedPhrases: [], profile: DEFAULT_PROFILE, ...extra };
}

describe('replayCard', () => {
  it('기록을 다시 적용하면 실제로 공부한 상태와 같다', () => {
    const { card, logs } = study(card0(), T0, [
      [T0 + H, 'good'],
      [T0 + D, 'again'],
      [T0 + 3 * D, 'good'],
    ], 'a');
    expect(replayCard({ ...card, fsrs: createFsrsCard(new Date(0)) }, logs)).toEqual(card);
  });
});

function card0() {
  return card('k1');
}

describe('mergeSnapshots', () => {
  it('원격이 없으면 로컬 그대로', () => {
    const s = snap([card('a')], []);
    expect(mergeSnapshots(s, null)).toBe(s);
  });

  it('같은 데이터끼리 합치면 바뀌지 않는다', () => {
    const a = study(card('a'), T0, [[T0 + H, 'good'], [T0 + 2 * D, 'hard']], 'x');
    const s = snap([a.card, card('b')], a.logs);
    const merged = mergeSnapshots(s, s);
    expect(merged.cards).toEqual([a.card, card('b')]);
    expect(merged.reviewLogs).toEqual(a.logs);
  });

  it('두 기기에서 따로 복습해도 한 기기에서 순서대로 한 것과 같은 상태가 된다', () => {
    // 기기 A: 배우고 1시간 뒤 복습. 기기 B: (A 기록을 받은 뒤) 이틀 뒤 복습, 다시 A 가 사흘 뒤 복습
    const base = study(card('a'), T0, [[T0 + H, 'good']], 'A');
    const onB = study(card('a'), T0, [[T0 + H, 'good'], [T0 + 2 * D, 'again']], 'B');
    const bLogs = [base.logs[0]!, { ...onB.logs[1]!, id: 'B-only' }];
    const onA = study(card('a'), T0, [[T0 + H, 'good'], [T0 + 3 * D, 'good']], 'A2');
    const aLogs = [base.logs[0]!, { ...onA.logs[1]!, id: 'A-only' }];

    const merged = mergeSnapshots(snap([onA.card], aLogs), snap([onB.card], bLogs));
    const expected = study(card('a'), T0, [[T0 + H, 'good'], [T0 + 2 * D, 'again'], [T0 + 3 * D, 'good']], 'E');
    expect(merged.reviewLogs.map((l) => l.id)).toEqual([base.logs[0]!.id, 'B-only', 'A-only']);
    expect(merged.cards[0]!.fsrs).toEqual(expected.card.fsrs);
  });

  it('한쪽에서만 배운 카드·수집함 카드도 합쳐진다', () => {
    const learned = study(card('a'), T0, [[T0 + H, 'good']], 'r');
    const mined = { ...introduceCard({ ...card('m'), source: 'mined' as const }, new Date(T0)) };
    const merged = mergeSnapshots(snap([card('a')], []), snap([learned.card, mined], learned.logs));
    expect(merged.cards.find((c) => c.id === 'a')!.fsrs).toEqual(learned.card.fsrs);
    expect(merged.cards.find((c) => c.id === 'm')!.source).toBe('mined');
  });

  it('배운 시각은 더 이른 쪽', () => {
    const early = introduceCard(card('a'), new Date(T0));
    const late = introduceCard(card('a'), new Date(T0 + D));
    expect(mergeSnapshots(snap([late], []), snap([early], [])).cards[0]!.introducedAt).toBe(T0);
  });

  it('같은 날짜의 하루: 완료 > 많이 진행 > 먼저 시작', () => {
    const day = (id: string, status: DayLog['status'], n: number, startedAt: number): DayLog => ({
      id,
      date: '2026-10-12',
      scenes: [],
      results: Array.from({ length: n }, () => ({ cardId: 'a', rating: 'good' as const, firstTry: true })),
      status,
      startedAt,
      endedAt: null,
      stagesAtStart: {},
    });
    const pick = (a: DayLog, b: DayLog) => mergeSnapshots(snap([], [], { days: [a] }), snap([], [], { days: [b] })).days[0]!.id;
    expect(pick(day('l', 'active', 9, 1), day('r', 'done', 2, 2))).toBe('r');
    expect(pick(day('l', 'active', 3, 1), day('r', 'active', 5, 2))).toBe('r');
    expect(pick(day('l', 'active', 3, 5), day('r', 'active', 3, 2))).toBe('r');
  });

  it('수집함: 카드로 바꾼 쪽 우선, 양쪽 표현 합집합', () => {
    const p = (id: string, cardId: string | null) => ({ id, ko: id, ja: null, note: '', createdAt: 0, cardId });
    const merged = mergeSnapshots(
      snap([], [], { minedPhrases: [p('x', null), p('y', null)] }),
      snap([], [], { minedPhrases: [p('x', 'mined-1'), p('z', null)] }),
    );
    expect(merged.minedPhrases.map((m) => [m.id, m.cardId])).toEqual([
      ['x', 'mined-1'],
      ['y', null],
      ['z', null],
    ]);
  });

  it('설정은 나중에 바꾼 쪽, 해금 장소는 합집합', () => {
    const local = { ...DEFAULT_PROFILE, dailyNewLimit: 10, settingsUpdatedAt: 5, unlockedThemes: ['konbini' as const] };
    const remote = {
      ...DEFAULT_PROFILE,
      dailyNewLimit: 20,
      settingsUpdatedAt: 9,
      unlockedThemes: ['konbini' as const, 'cafe' as const],
    };
    const merged = mergeSnapshots(snap([], [], { profile: local }), snap([], [], { profile: remote })).profile;
    expect(merged.dailyNewLimit).toBe(20);
    expect(merged.unlockedThemes).toEqual(['konbini', 'cafe']);
  });
});
