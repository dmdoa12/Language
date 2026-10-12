// 기기 간 동기화: 두 기록(로컬·원격 스냅숏)을 합친다.
// - 복습 기록은 id 기준 합집합. 카드의 FSRS 상태는 합친 기록을 시간순으로 다시 적용해 재계산한다.
// - 그래서 두 기기에서 따로 공부해도 양쪽 복습이 모두 반영되고, 같은 데이터끼리 합치면 그대로다.
import type { BackupData } from './backup';
import { replayCard } from './fsrs';
import { THEME_ORDER, type DayLog, type MinedPhrase, type Profile, type ReviewLogEntry, type StudyCard } from './types';

export type Snapshot = Omit<BackupData, 'version'>;

function minIntroducedAt(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function mergeCards(local: readonly StudyCard[], remote: readonly StudyCard[], logs: readonly ReviewLogEntry[]): StudyCard[] {
  const byId = new Map<string, StudyCard>();
  for (const c of remote) byId.set(c.id, c);
  for (const c of local) {
    const other = byId.get(c.id);
    // 내용(문장 등)은 로컬 우선, 배운 시각은 더 이른 쪽
    byId.set(c.id, other ? { ...c, introducedAt: minIntroducedAt(c.introducedAt, other.introducedAt) } : c);
  }
  const logsByCard = new Map<string, ReviewLogEntry[]>();
  for (const l of logs) logsByCard.set(l.cardId, [...(logsByCard.get(l.cardId) ?? []), l]);

  const out: StudyCard[] = [];
  for (const card of byId.values()) {
    const cardLogs = logsByCard.get(card.id) ?? [];
    // 기록이 있는데 배운 시각이 없으면 첫 기록 시각으로 본다 (안전장치)
    const introducedAt =
      card.introducedAt ?? (cardLogs.length > 0 ? Math.min(...cardLogs.map((l) => l.answeredAt)) : null);
    out.push(replayCard({ ...card, introducedAt }, cardLogs));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function unionById<T extends { id: string }>(local: readonly T[], remote: readonly T[], prefer?: (a: T, b: T) => T): T[] {
  const byId = new Map<string, T>();
  for (const r of remote) byId.set(r.id, r);
  for (const l of local) {
    const r = byId.get(l.id);
    byId.set(l.id, r && prefer ? prefer(l, r) : l);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// 같은 날짜의 하루가 양쪽에 있으면: 완료한 쪽 → 더 많이 진행한 쪽 → 먼저 시작한 쪽.
function pickDay(a: DayLog, b: DayLog): DayLog {
  if (a.status !== b.status) return a.status === 'done' ? a : b;
  if (a.results.length !== b.results.length) return a.results.length > b.results.length ? a : b;
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? a : b;
  return a.id <= b.id ? a : b;
}

function mergeDays(local: readonly DayLog[], remote: readonly DayLog[]): DayLog[] {
  const byDate = new Map<string, DayLog>();
  for (const d of [...remote, ...local]) {
    const other = byDate.get(d.date);
    byDate.set(d.date, other ? pickDay(d, other) : d);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// 수집함: 카드로 바꾼 쪽, 일본어를 채운 쪽을 우선.
function preferPhrase(a: MinedPhrase, b: MinedPhrase): MinedPhrase {
  if ((a.cardId === null) !== (b.cardId === null)) return a.cardId !== null ? a : b;
  if ((a.ja === null) !== (b.ja === null)) return a.ja !== null ? a : b;
  return a;
}

function mergeProfile(local: Profile, remote: Profile): Profile {
  const settings = remote.settingsUpdatedAt > local.settingsUpdatedAt ? remote : local;
  const unlocked = THEME_ORDER.filter((t) => local.unlockedThemes.includes(t) || remote.unlockedThemes.includes(t));
  return {
    ...local,
    dailyNewLimit: settings.dailyNewLimit,
    challenge: settings.challenge,
    settingsUpdatedAt: settings.settingsUpdatedAt,
    unlockedThemes: unlocked,
    // 연속 기록·휴식권은 합친 복습 기록에서 다시 계산된다
  };
}

export function mergeSnapshots(local: Snapshot, remote: Snapshot | null): Snapshot {
  if (!remote) return local;
  const reviewLogs = unionById(local.reviewLogs, remote.reviewLogs).sort(
    (a, b) => a.answeredAt - b.answeredAt || a.id.localeCompare(b.id),
  );
  return {
    exportedAt: Math.max(local.exportedAt, remote.exportedAt),
    cards: mergeCards(local.cards, remote.cards, reviewLogs),
    reviewLogs,
    days: mergeDays(local.days, remote.days),
    minedPhrases: unionById(local.minedPhrases, remote.minedPhrases, preferPhrase),
    profile: mergeProfile(local.profile, remote.profile),
  };
}
