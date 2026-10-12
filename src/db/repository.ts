import type { ReviewLog } from 'ts-fsrs';
import { applyReview, introduceCard } from '../core/fsrs';
import { serializeBackup, type BackupData } from '../core/backup';
import {
  DEFAULT_PROFILE,
  type MinedPhrase,
  type Profile,
  type ReviewLogEntry,
  type DayLog,
  type StudyCard,
  type StudyRating,
} from '../core/types';
import { buildDeckCards } from '../data/seed';
import { db, deleteLegacyDatabases, PROFILE_ID } from './schema';

// 덱에 새로 추가된 시드 카드만 넣는다. 기존 카드의 학습 기록은 건드리지 않는다.
export async function ensureSeeded(now: Date): Promise<void> {
  await deleteLegacyDatabases();
  await db.transaction('rw', db.cards, db.profile, async () => {
    const existing = new Set(await db.cards.toCollection().primaryKeys());
    const missing = buildDeckCards(now).filter((c) => !existing.has(c.id));
    if (missing.length > 0) await db.cards.bulkAdd(missing);
    if (!(await db.profile.get(PROFILE_ID))) {
      await db.profile.add({ id: PROFILE_ID, ...DEFAULT_PROFILE });
    }
  });
}

export async function loadCards(): Promise<StudyCard[]> {
  return db.cards.toArray();
}

export async function loadProfile(): Promise<Profile> {
  const row = await db.profile.get(PROFILE_ID);
  if (!row) return { ...DEFAULT_PROFILE };
  const { id: _id, ...profile } = row;
  return { ...DEFAULT_PROFILE, ...profile, challenge: { ...DEFAULT_PROFILE.challenge, ...profile.challenge } };
}

export async function introduce(card: StudyCard, now: Date): Promise<StudyCard> {
  const introduced = introduceCard(card, now);
  await db.cards.put(introduced);
  return introduced;
}

export interface ReviewInput {
  card: StudyCard;
  rating: StudyRating;
  input: string;
  hintUsed: boolean;
  elapsedMs: number;
  dayId: string | null;
  now: Date;
}

function buildLogEntry(cardId: string, args: ReviewInput, log: ReviewLog): ReviewLogEntry {
  return {
    id: crypto.randomUUID(),
    cardId,
    dayId: args.dayId,
    rating: args.rating,
    input: args.input,
    hintUsed: args.hintUsed,
    elapsedMs: args.elapsedMs,
    answeredAt: args.now.getTime(),
    fsrsLog: log,
  };
}

// 카드 FSRS 상태와 복습 로그를 한 트랜잭션으로 저장한다.
export async function recordReview(
  args: ReviewInput,
): Promise<{ card: StudyCard; entry: ReviewLogEntry }> {
  const { card, log } = applyReview(args.card, args.rating, args.now);
  const entry = buildLogEntry(card.id, args, log);
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.put(card);
    await db.reviewLogs.add(entry);
  });
  return { card, entry };
}

export async function loadDays(): Promise<DayLog[]> {
  return db.days.toArray();
}

export async function saveDay(day: DayLog): Promise<void> {
  await db.days.put(day);
}

// 하루 진행 기록과 (FSRS 대상이면) 카드·복습 로그를 한 트랜잭션으로.
export async function saveDayAndReview(day: DayLog, review: ReviewInput | null): Promise<StudyCard | null> {
  if (!review) {
    await saveDay(day);
    return null;
  }
  const { card, log } = applyReview(review.card, review.rating, review.now);
  const entry = buildLogEntry(card.id, review, log);
  await db.transaction('rw', db.cards, db.reviewLogs, db.days, async () => {
    await db.cards.put(card);
    await db.reviewLogs.add(entry);
    await db.days.put(day);
  });
  return card;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put({ id: PROFILE_ID, ...profile });
}

export async function loadAnsweredTimes(): Promise<number[]> {
  return (await db.reviewLogs.orderBy('answeredAt').keys()) as number[];
}

export async function loadMinedPhrases(): Promise<MinedPhrase[]> {
  return db.minedPhrases.orderBy('createdAt').reverse().toArray();
}

export async function saveMinedPhrase(phrase: MinedPhrase): Promise<void> {
  await db.minedPhrases.put(phrase);
}

export async function deleteMinedPhrase(id: string): Promise<void> {
  await db.minedPhrases.delete(id);
}

// 수집함 표현을 카드로: 카드 추가와 표현 연결을 한 트랜잭션으로.
export async function convertMinedPhrase(phrase: MinedPhrase, card: StudyCard): Promise<MinedPhrase> {
  const linked = { ...phrase, cardId: card.id, ja: phrase.ja ?? card.ja };
  await db.transaction('rw', db.cards, db.minedPhrases, async () => {
    await db.cards.add(card);
    await db.minedPhrases.put(linked);
  });
  return linked;
}

export async function exportAll(now: number): Promise<string> {
  const [cards, reviewLogs, days, minedPhrases, profile] = await Promise.all([
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.days.toArray(),
    db.minedPhrases.toArray(),
    loadProfile(),
  ]);
  return serializeBackup({ exportedAt: now, cards, reviewLogs, days, minedPhrases, profile });
}

// 전부 지우고 백업으로 교체한다. 이후 덱에 새로 생긴 시드 카드는 ensureSeeded 가 채운다.
export async function importAll(data: BackupData): Promise<void> {
  await db.transaction('rw', [db.cards, db.reviewLogs, db.days, db.minedPhrases, db.profile], async () => {
    await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.days.clear(), db.minedPhrases.clear(), db.profile.clear()]);
    await db.cards.bulkPut(data.cards);
    await db.reviewLogs.bulkPut(data.reviewLogs);
    await db.days.bulkPut(data.days);
    await db.minedPhrases.bulkPut(data.minedPhrases);
    await db.profile.put({ id: PROFILE_ID, ...data.profile });
  });
}
