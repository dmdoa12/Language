import { seoulDateKey } from './date';
import { selectDueCards, selectNewCards } from './fsrs';
import { isLeech } from './mapgen';
import { isPracticeRun } from './run';
import type { Profile, Run, StudyCard } from './types';

export type NextStep =
  | { kind: 'review'; card: StudyCard }
  | { kind: 'new'; card: StudyCard }
  | { kind: 'done'; nextDueAt: number | null };

// 빠른 복습 순서:
// 1) 지금 due 인 카드  2) (allowNew 일 때) 신규 카드 한 장씩  3) 곧 due 인 학습 단계 카드(미리 출제)
// 방금 틀린 카드가 곧바로 다시 나오지 않도록 미리 출제는 신규 카드보다 뒤에 둔다.
// 런이 생긴 뒤로 신규 도입은 상점 담당이라 빠른 복습은 allowNew=false 로 쓴다.
export function pickNextStep(
  cards: readonly StudyCard[],
  profile: Pick<Profile, 'unlockedThemes' | 'dailyNewLimit'>,
  now: Date,
  options: { allowNew: boolean } = { allowNew: true },
): NextStep {
  const due = selectDueCards(cards, now, 0)[0];
  if (due) return { kind: 'review', card: due };

  if (options.allowNew) {
    const fresh = selectNewCards(cards, profile.unlockedThemes, profile.dailyNewLimit, now)[0];
    if (fresh) return { kind: 'new', card: fresh };
  }

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

export interface RunPlan {
  date: string;
  seed: string;
  practice: boolean;
  due: StudyCard[];
  leeches: StudyCard[];
}

// 런 시작 입력: 오늘 due(미리 출제 포함, retrievability 오름차순), 리치, seed, 연습 여부.
export function planRun(cards: readonly StudyCard[], runs: readonly Pick<Run, 'date'>[], now: Date): RunPlan {
  const date = seoulDateKey(now);
  const runsToday = runs.filter((r) => r.date === date);
  return {
    date,
    seed: `${date}#${runsToday.length + 1}`,
    practice: isPracticeRun(runsToday, date),
    due: selectDueCards(cards, now),
    leeches: cards.filter(isLeech),
  };
}

// 해당 날짜(서울) 끝까지 due 가 되는 도입된 카드 수.
export function countDueBy(cards: readonly StudyCard[], dateKey: string): number {
  return cards.filter((c) => c.introducedAt !== null && seoulDateKey(c.fsrs.due) <= dateKey).length;
}
