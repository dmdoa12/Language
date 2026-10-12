import Dexie, { type EntityTable } from 'dexie';
import type { MinedPhrase, Profile, ReviewLogEntry, Run, StudyCard } from '../core/types';

export const PROFILE_ID = 'me';

export interface ProfileRow extends Profile {
  id: typeof PROFILE_ID;
}

export class AppDatabase extends Dexie {
  cards!: EntityTable<StudyCard, 'id'>;
  reviewLogs!: EntityTable<ReviewLogEntry, 'id'>;
  runs!: EntityTable<Run, 'id'>;
  minedPhrases!: EntityTable<MinedPhrase, 'id'>;
  profile!: EntityTable<ProfileRow, 'id'>;

  constructor(name = 'jp-talk-roguelike') {
    super(name);
    this.version(1).stores({
      cards: 'id, theme, source, introducedAt, fsrs.due',
      reviewLogs: 'id, cardId, runId, answeredAt',
      runs: 'id, date, status',
      minedPhrases: 'id, createdAt, cardId',
      profile: 'id',
    });
  }
}

export const db = new AppDatabase();
