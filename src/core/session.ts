import { selectDueCards, selectNewCards } from './fsrs';
import type { Profile, StudyCard } from './types';

export type NextStep =
  | { kind: 'review'; card: StudyCard }
  | { kind: 'new'; card: StudyCard }
  | { kind: 'done'; nextDueAt: number | null };

// Phase 1 단순 복습 순서 (Phase 2 에서 신규 도입은 상점 구매로 대체):
// 1) 지금 due 인 카드  2) 신규 카드 한 장씩  3) 곧 due 인 학습 단계 카드(미리 출제)
// 방금 틀린 카드가 곧바로 다시 나오지 않도록 미리 출제는 신규 카드보다 뒤에 둔다.
export function pickNextStep(
  cards: readonly StudyCard[],
  profile: Pick<Profile, 'unlockedThemes' | 'dailyNewLimit'>,
  now: Date,
): NextStep {
  const due = selectDueCards(cards, now, 0)[0];
  if (due) return { kind: 'review', card: due };

  const fresh = selectNewCards(cards, profile.unlockedThemes, profile.dailyNewLimit, now)[0];
  if (fresh) return { kind: 'new', card: fresh };

  const ahead = selectDueCards(cards, now)[0];
  if (ahead) return { kind: 'review', card: ahead };

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
