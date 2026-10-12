import type { Card, ReviewLog } from 'ts-fsrs';

export type Theme =
  | 'konbini'
  | 'cafe'
  | 'restaurant'
  | 'directions'
  | 'friends_plan'
  | 'smalltalk'
  | 'consult';

export const THEME_ORDER: readonly Theme[] = [
  'konbini',
  'cafe',
  'restaurant',
  'directions',
  'friends_plan',
  'smalltalk',
  'consult',
];

export type StudyRating = 'again' | 'hard' | 'good';

export interface StudyCard {
  id: string;
  ja: string;
  readings: string[];
  ko: string;
  situation: string;
  theme: Theme;
  grammarTags: string[];
  source: 'deck' | 'mined';
  fsrs: Card;
  introducedAt: number | null;
}

export interface ReviewLogEntry {
  id: string;
  cardId: string;
  runId: string | null;
  rating: StudyRating;
  input: string;
  hintUsed: boolean;
  elapsedMs: number;
  answeredAt: number;
  fsrsLog: ReviewLog;
}

export type NodeType = 'battle' | 'elite' | 'shop' | 'rest' | 'event' | 'boss';

export interface MapNode {
  id: string;
  floor: number;
  type: NodeType;
  cardIds: string[];
  next: string[];
  cleared: boolean;
}

export interface Run {
  id: string;
  seed: string;
  date: string;
  nodes: MapNode[];
  currentNodeId: string | null;
  hp: number;
  maxHp: number;
  gold: number;
  relicIds: string[];
  status: 'active' | 'won' | 'dead' | 'abandoned';
  startedAt: number;
  endedAt: number | null;
}

export interface Relic {
  id: string;
  name: string;
  description: string;
  effect: 'hint_once' | 'negate_wrong_once' | 'shop_extra_choice' | 'max_hp_plus1';
}

export interface MinedPhrase {
  id: string;
  ko: string;
  ja: string | null;
  note: string;
  createdAt: number;
  cardId: string | null;
}

export interface Profile {
  dailyNewLimit: number;
  unlockedThemes: Theme[];
  ascension: number;
  restTokens: number;
  streak: number;
  ownedRelicIds: string[];
}

export const DEFAULT_PROFILE: Profile = {
  dailyNewLimit: 15,
  unlockedThemes: ['konbini'],
  ascension: 0,
  restTokens: 2,
  streak: 0,
  ownedRelicIds: [],
};
