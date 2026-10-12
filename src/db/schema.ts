import Dexie, { type EntityTable } from 'dexie';
import type { DayLog, MinedPhrase, Profile, ReviewLogEntry, StudyCard } from '../core/types';

export const PROFILE_ID = 'me';
export const DB_NAME = 'jp-talk-day';
// Phase 4 까지 쓰던 로그라이크 데이터베이스. 새 방식으로 바꾸며 전부 초기화하기로 해서 처음 열 때 지운다.
export const LEGACY_DB_NAMES = ['jp-talk-roguelike'];

export interface ProfileRow extends Profile {
  id: typeof PROFILE_ID;
}

export class AppDatabase extends Dexie {
  cards!: EntityTable<StudyCard, 'id'>;
  reviewLogs!: EntityTable<ReviewLogEntry, 'id'>;
  days!: EntityTable<DayLog, 'id'>;
  minedPhrases!: EntityTable<MinedPhrase, 'id'>;
  profile!: EntityTable<ProfileRow, 'id'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      cards: 'id, theme, source, introducedAt, fsrs.due',
      reviewLogs: 'id, cardId, dayId, answeredAt',
      days: 'id, date, status',
      minedPhrases: 'id, createdAt, cardId',
      profile: 'id',
    });
  }
}

export const db = new AppDatabase();

export async function deleteLegacyDatabases(): Promise<void> {
  for (const name of LEGACY_DB_NAMES) {
    if (await Dexie.exists(name)) await Dexie.delete(name);
  }
}
