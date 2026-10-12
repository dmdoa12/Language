import { createFsrsCard } from '../../core/fsrs';
import type { StudyCard, Theme } from '../../core/types';
import cafe from './cafe.json';
import konbini from './konbini.json';

export interface SeedCard {
  id: string;
  ja: string;
  readings: string[];
  ko: string;
  situation: string;
  grammarTags: string[];
}

export const SEED_DECKS: Partial<Record<Theme, readonly SeedCard[]>> = {
  konbini,
  cafe,
};

export function buildDeckCards(now: Date): StudyCard[] {
  return Object.entries(SEED_DECKS).flatMap(([theme, seeds]) =>
    (seeds ?? []).map(
      (seed): StudyCard => ({
        ...seed,
        theme: theme as Theme,
        source: 'deck',
        fsrs: createFsrsCard(now),
        introducedAt: null,
      }),
    ),
  );
}
