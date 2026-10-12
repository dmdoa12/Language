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
  cardIds: string[]; //        층 batch (오늘 due). FSRS 에 기록
  extraCardIds: string[]; //   엘리트 리치 카드 등 연습 출제. FSRS 에 기록하지 않음
  answeredCardIds: string[]; // 이 노드에서 이미 답한 카드 (재개용)
  earnedGold: number; //        이 노드 답변으로 쌓인 기본 골드 (배율 적용 전)
  next: string[];
  cleared: boolean;
}

export interface AnswerStats {
  good: number;
  hard: number;
  again: number;
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
  practice: boolean; //          같은 날 두 번째 이후 런 (보상 절반)
  mainTheme: Theme | null; //    보스 테마
  consumedRelicIds: string[]; // 런 중 1회성 효과를 이미 쓴 유물
  stats: AnswerStats;
  chatBonusClaimed?: boolean; //  보스 대화 보너스를 받았는가 (Phase 4)
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
