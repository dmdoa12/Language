import { selectDueCards, selectNewCards } from './fsrs';
import type { Profile, StudyCard } from './types';

export type NextStep =
  | { kind: 'review'; card: StudyCard }
  | { kind: 'new'; card: StudyCard }
  | { kind: 'done'; nextDueAt: number | null };

// Phase 1 단순 복습: due 카드를 먼저 전부 풀고, 남으면 신규 카드를 한 장씩 도입한다.
// (Phase 2 에서 신규 도입은 상점 구매로 대체)
export function pickNextStep(
  cards: readonly StudyCard[],
  profile: Pick<Profile, 'unlockedThemes' | 'dailyNewLimit'>,
  now: Date,
): NextStep {
  const due = selectDueCards(cards, now)[0];
  if (due) return { kind: 'review', card: due };

  const fresh = selectNewCards(cards, profile.unlockedThemes, profile.dailyNewLimit, now)[0];
  if (fresh) return { kind: 'new', card: fresh };

  const upcoming = cards
    .filter((c) => c.introducedAt !== null)
    .map((c) => c.fsrs.due.getTime());
  return { kind: 'done', nextDueAt: upcoming.length > 0 ? Math.min(...upcoming) : null };
}

export interface TodaySummary {
  dueCount: number;
  newAvailable: number;
}

export function summarizeToday(
  cards: readonly StudyCard[],
  profile: Pick<Profile, 'unlockedThemes' | 'dailyNewLimit'>,
  now: Date,
): TodaySummary {
  return {
    dueCount: selectDueCards(cards, now).length,
    newAvailable: selectNewCards(cards, profile.unlockedThemes, profile.dailyNewLimit, now).length,
  };
}

// 힌트: 첫 번째 reading 의 앞 1/3 (최소 1글자).
export function buildHint(card: Pick<StudyCard, 'readings'>): string {
  const chars = Array.from(card.readings[0] ?? '');
  const n = Math.max(1, Math.ceil(chars.length / 3));
  return chars.slice(0, n).join('') + '…';
}
