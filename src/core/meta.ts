import { seoulDateKey } from './date';
import { RELICS } from './relics';
import { THEME_ORDER, type StudyCard, type Theme } from './types';

export const MASTERED_STABILITY = 21; // 레벨·희귀 유물 기준
export const UNLOCK_STABILITY = 7; //    테마 해금 기준
export const UNLOCK_RATIO = 0.7;
export const CARDS_PER_LEVEL = 20;
export const WEEKLY_REST_TOKENS = 2;

// 희귀 유물 해금 순서: 수집함 카드가 하나씩 숙달될 때마다 앞에서부터.
export const RARE_RELIC_ORDER: readonly string[] = ['omamori', 'memo', 'catalog', 'bento'];

function isMastered(card: StudyCard): boolean {
  return card.introducedAt !== null && card.fsrs.stability >= MASTERED_STABILITY;
}

export function masteredCount(cards: readonly StudyCard[]): number {
  return cards.filter(isMastered).length;
}

// 레벨 1 부터. stability >= 21 카드 20장당 1레벨.
export function characterLevel(cards: readonly StudyCard[]): number {
  return 1 + Math.floor(masteredCount(cards) / CARDS_PER_LEVEL);
}

export function levelProgress(cards: readonly StudyCard[]): { current: number; needed: number } {
  return { current: masteredCount(cards) % CARDS_PER_LEVEL, needed: CARDS_PER_LEVEL };
}

// 테마의 덱 카드 중 stability >= 7 비율. 덱 카드가 없으면 0.
export function themeStableRatio(cards: readonly StudyCard[], theme: Theme): number {
  const deck = cards.filter((c) => c.theme === theme && c.source === 'deck');
  if (deck.length === 0) return 0;
  const stable = deck.filter((c) => c.introducedAt !== null && c.fsrs.stability >= UNLOCK_STABILITY).length;
  return stable / deck.length;
}

// konbini 는 처음부터. 이전 테마 덱의 70% 가 stability >= 7 이면 다음 테마 해금 (순서대로).
// 이미 해금된 테마는 기록이 떨어져도 잠그지 않는다.
export function computeUnlockedThemes(cards: readonly StudyCard[], alreadyUnlocked: readonly Theme[]): Theme[] {
  const unlocked: Theme[] = [THEME_ORDER[0]!];
  for (let i = 1; i < THEME_ORDER.length; i++) {
    const theme = THEME_ORDER[i]!;
    const prev = THEME_ORDER[i - 1]!;
    if (alreadyUnlocked.includes(theme) || themeStableRatio(cards, prev) >= UNLOCK_RATIO) unlocked.push(theme);
    else break;
  }
  return unlocked;
}

// 숙달된 수집함 카드 수만큼 희귀 유물을 순서대로 영구 해금.
export function computeOwnedRelics(cards: readonly StudyCard[], alreadyOwned: readonly string[]): string[] {
  const earned = cards.filter((c) => c.source === 'mined' && isMastered(c)).length;
  const owned = new Set([...alreadyOwned, ...RARE_RELIC_ORDER.slice(0, earned)]);
  return RELICS.map((r) => r.id).filter((id) => owned.has(id));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(dateKey: string, days: number): string {
  // 날짜 키 산술은 UTC 정오 기준으로 해서 시간대 영향을 없앤다.
  const t = Date.parse(`${dateKey}T12:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

// 월요일 시작 주의 키.
function weekKey(dateKey: string): string {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay(); // 0=일
  return addDays(dateKey, -((day + 6) % 7));
}

export interface StreakState {
  streak: number;
  restTokens: number; // 이번 주 남은 휴식권
}

// 연속 기록: 복습한 날(서울 날짜)이 이어진 일수. 빈 날은 그 날이 속한 주의 휴식권(주 2개)으로 메운다.
// 빈 구간은 통째로 메울 수 있을 때만 휴식권을 쓴다. 오늘은 아직 안 했어도 끊기지 않는다.
export function computeStreak(activeDates: Iterable<string>, today: string): StreakState {
  const active = [...new Set(activeDates)].filter((d) => d <= today).sort();
  const isActive = new Set(active);
  const usedPerWeek = new Map<string, number>();

  let streak = 0;
  let cursor = isActive.has(today) ? today : addDays(today, -1);
  while (true) {
    if (isActive.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    // 빈 구간: cursor 부터 그 이전의 가장 가까운 기록일 전날까지.
    const prevActive = active.filter((d) => d < cursor).at(-1);
    if (prevActive === undefined) break;
    const gap: string[] = [];
    for (let d = cursor; d > prevActive; d = addDays(d, -1)) gap.push(d);
    const need = new Map<string, number>();
    for (const d of gap) need.set(weekKey(d), (need.get(weekKey(d)) ?? 0) + 1);
    const affordable = [...need].every(([wk, n]) => (usedPerWeek.get(wk) ?? 0) + n <= WEEKLY_REST_TOKENS);
    if (!affordable) break;
    for (const [wk, n] of need) usedPerWeek.set(wk, (usedPerWeek.get(wk) ?? 0) + n);
    cursor = prevActive;
  }
  return { streak, restTokens: WEEKLY_REST_TOKENS - (usedPerWeek.get(weekKey(today)) ?? 0) };
}

export function activeDateKeys(answeredAts: Iterable<number>): Set<string> {
  const out = new Set<string>();
  for (const t of answeredAts) out.add(seoulDateKey(t));
  return out;
}
