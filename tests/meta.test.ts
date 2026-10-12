import { describe, expect, it } from 'vitest';
import { createFsrsCard } from '../src/core/fsrs';
import {
  activeDateKeys,
  characterLevel,
  computeStreak,
  computeUnlockedThemes,
  levelProgress,
  themeStableRatio,
} from '../src/core/meta';
import type { StudyCard, Theme } from '../src/core/types';

const T0 = new Date('2026-10-12T00:00:00Z');

function card(
  id: string,
  stability: number,
  opts: { theme?: Theme; source?: 'deck' | 'mined'; introduced?: boolean } = {},
): StudyCard {
  return {
    id,
    ja: '',
    readings: [''],
    ko: '',
    situation: '',
    theme: opts.theme ?? 'konbini',
    grammarTags: [],
    source: opts.source ?? 'deck',
    fsrs: { ...createFsrsCard(T0), stability },
    introducedAt: opts.introduced === false ? null : T0.getTime(),
  };
}

function many(n: number, stability: number, opts: Parameters<typeof card>[2] = {}): StudyCard[] {
  return Array.from({ length: n }, (_, i) => card(`${opts.theme ?? 'k'}-${stability}-${i}`, stability, opts));
}

describe('characterLevel', () => {
  it('stability >= 21 카드 20장당 1레벨, 1부터 시작', () => {
    expect(characterLevel([])).toBe(1);
    expect(characterLevel(many(19, 21))).toBe(1);
    expect(characterLevel(many(20, 21))).toBe(2);
    expect(characterLevel([...many(45, 30), ...many(10, 20)])).toBe(3);
    expect(levelProgress(many(45, 30))).toEqual({ current: 5, needed: 20 });
  });

  it('안 배운 카드는 세지 않는다', () => {
    expect(characterLevel(many(20, 50, { introduced: false }))).toBe(1);
  });
});

describe('테마 해금', () => {
  it('덱 카드의 70% 가 stability >= 7 이면 다음 테마', () => {
    const konbini = [...many(7, 7), ...many(3, 1)];
    expect(themeStableRatio(konbini, 'konbini')).toBeCloseTo(0.7);
    expect(computeUnlockedThemes(konbini, ['konbini'])).toEqual(['konbini', 'cafe']);
    const short = [...many(6, 7), ...many(4, 1)];
    expect(computeUnlockedThemes(short, ['konbini'])).toEqual(['konbini']);
  });

  it('순서대로만 해금되고, 덱 카드가 없는 테마 다음은 열리지 않는다', () => {
    const cards = [...many(10, 10), ...many(10, 10, { theme: 'cafe' })];
    expect(computeUnlockedThemes(cards, [])).toEqual(['konbini', 'cafe', 'restaurant']);
  });

  it('수집함 카드는 해금 비율에 넣지 않는다', () => {
    const cards = [...many(3, 10), ...many(7, 1), ...many(20, 30, { source: 'mined' })];
    expect(computeUnlockedThemes(cards, [])).toEqual(['konbini']);
  });

  it('이미 해금된 테마는 유지', () => {
    expect(computeUnlockedThemes([], ['konbini', 'cafe'])).toEqual(['konbini', 'cafe']);
  });
});

describe('computeStreak', () => {
  // 2026-10-12 는 월요일
  it('연속된 날을 센다. 오늘 안 했어도 어제까지면 유지', () => {
    expect(computeStreak(['2026-10-10', '2026-10-11', '2026-10-12'], '2026-10-12').streak).toBe(3);
    expect(computeStreak(['2026-10-10', '2026-10-11'], '2026-10-12').streak).toBe(2);
    expect(computeStreak([], '2026-10-12')).toEqual({ streak: 0, restTokens: 2 });
  });

  it('빈 날은 그 주 휴식권으로 메운다 (주 2개)', () => {
    // 14(수) 15(목) 빔, 13·16 기록 → 휴식권 2개 사용
    const s = computeStreak(['2026-10-13', '2026-10-16'], '2026-10-16');
    expect(s).toEqual({ streak: 2, restTokens: 0 });
  });

  it('휴식권이 모자라면 그 빈 구간에서 끊기고 휴식권은 쓰지 않는다', () => {
    const s = computeStreak(['2026-10-12', '2026-10-16'], '2026-10-16');
    expect(s).toEqual({ streak: 1, restTokens: 2 });
  });

  it('주가 바뀌면 휴식권도 새로', () => {
    // 지난주(10/5~11) 2개 사용, 이번 주 1개 사용
    const days = ['2026-10-06', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-13'];
    const s = computeStreak(days, '2026-10-13');
    // 10/12(월, 이번 주) 휴식권 1, 10/7·10/8(지난주) 휴식권 2
    expect(s).toEqual({ streak: 5, restTokens: 1 });
  });

  it('activeDateKeys 는 서울 날짜로 묶는다', () => {
    const keys = activeDateKeys([Date.parse('2026-10-12T14:59:00Z'), Date.parse('2026-10-12T15:00:00Z')]);
    expect([...keys]).toEqual(['2026-10-12', '2026-10-13']);
  });
});
