import { applyReview, introduceCard } from '../core/fsrs';
import {
  DEFAULT_PROFILE,
  type Profile,
  type ReviewLogEntry,
  type StudyCard,
  type StudyRating,
} from '../core/types';
import { buildDeckCards } from '../data/seed';
import { db, PROFILE_ID } from './schema';

// 덱에 새로 추가된 시드 카드만 넣는다. 기존 카드의 학습 기록은 건드리지 않는다.
export async function ensureSeeded(now: Date): Promise<void> {
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
  return profile;
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
  runId: string | null;
  now: Date;
}

// 카드 FSRS 상태와 복습 로그를 한 트랜잭션으로 저장한다.
export async function recordReview(
  args: ReviewInput,
): Promise<{ card: StudyCard; entry: ReviewLogEntry }> {
  const { card, log } = applyReview(args.card, args.rating, args.now);
  const entry: ReviewLogEntry = {
    id: crypto.randomUUID(),
    cardId: card.id,
    runId: args.runId,
    rating: args.rating,
    input: args.input,
    hintUsed: args.hintUsed,
    elapsedMs: args.elapsedMs,
    answeredAt: args.now.getTime(),
    fsrsLog: log,
  };
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.put(card);
    await db.reviewLogs.add(entry);
  });
  return { card, entry };
}
