import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs';
import { seoulDateKey } from './date';
import type { StudyCard, StudyRating, Theme } from './types';

// 퍼즈 끔: 같은 입력이면 같은 일정 (테스트·재현성).
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

// 학습/재학습 단계(분 단위 스텝) 카드는 이 시간 안에 due 이면 미리 출제한다.
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

const RATING_TO_GRADE: Record<StudyRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

export function createFsrsCard(now: Date): Card {
  return createEmptyCard(now);
}

export function scheduleReview(
  card: Card,
  rating: StudyRating,
  now: Date,
): { card: Card; log: ReviewLog } {
  const { card: next, log } = scheduler.next(card, now, RATING_TO_GRADE[rating]);
  return { card: next, log };
}

export function getRetrievability(card: Card, now: Date): number {
  if (card.state === State.New) return 0;
  return scheduler.get_retrievability(card, now, false);
}

export function isIntroduced(card: StudyCard): boolean {
  return card.introducedAt !== null;
}

function isLearningState(card: Card): boolean {
  return card.state === State.Learning || card.state === State.Relearning;
}

export function isDue(card: StudyCard, now: Date, learnAheadMs = LEARN_AHEAD_MS): boolean {
  if (!isIntroduced(card)) return false;
  const due = card.fsrs.due.getTime();
  if (due <= now.getTime()) return true;
  return isLearningState(card.fsrs) && due <= now.getTime() + learnAheadMs;
}

// 오늘 복습할 카드: due 인 도입된 카드를 retrievability 오름차순(잊기 쉬운 것부터).
export function selectDueCards(
  cards: readonly StudyCard[],
  now: Date,
  learnAheadMs = LEARN_AHEAD_MS,
): StudyCard[] {
  return cards
    .filter((c) => isDue(c, now, learnAheadMs))
    .map((c) => ({ c, r: getRetrievability(c.fsrs, now) }))
    .sort((a, b) => a.r - b.r || a.c.id.localeCompare(b.c.id))
    .map(({ c }) => c);
}

export function countIntroducedOn(cards: readonly StudyCard[], dateKey: string): number {
  return cards.filter((c) => c.introducedAt !== null && seoulDateKey(c.introducedAt) === dateKey)
    .length;
}

// 신규 후보: 아직 안 배운 카드 중 해금 테마. 오늘 남은 한도만큼 덱 순서대로.
export function selectNewCards(
  cards: readonly StudyCard[],
  unlockedThemes: readonly Theme[],
  dailyNewLimit: number,
  now: Date,
): StudyCard[] {
  const remaining = Math.max(0, dailyNewLimit - countIntroducedOn(cards, seoulDateKey(now)));
  return cards
    .filter((c) => !isIntroduced(c) && unlockedThemes.includes(c.theme))
    .slice(0, remaining);
}

export function introduceCard(card: StudyCard, now: Date): StudyCard {
  return { ...card, introducedAt: now.getTime(), fsrs: createFsrsCard(now) };
}

export function applyReview(
  card: StudyCard,
  rating: StudyRating,
  now: Date,
): { card: StudyCard; log: ReviewLog } {
  const { card: fsrsCard, log } = scheduleReview(card.fsrs, rating, now);
  return { card: { ...card, fsrs: fsrsCard }, log };
}

// 복습 기록을 시간순으로 다시 적용해 카드의 FSRS 상태를 재구성한다 (기기 간 동기화 병합용).
// 퍼즈가 꺼져 있어 같은 기록 → 같은 상태.
export function replayCard(
  card: StudyCard,
  logs: readonly { rating: StudyRating; answeredAt: number; id: string }[],
): StudyCard {
  if (card.introducedAt === null) return card;
  const ordered = [...logs].sort((a, b) => a.answeredAt - b.answeredAt || a.id.localeCompare(b.id));
  let fsrsCard = createFsrsCard(new Date(card.introducedAt));
  for (const log of ordered) fsrsCard = scheduleReview(fsrsCard, log.rating, new Date(log.answeredAt)).card;
  return { ...card, fsrs: fsrsCard };
}
