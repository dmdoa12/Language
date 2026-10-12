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
  dayId: string | null; // 하루 진행 중이면 DayLog id, 빠른 복습이면 null
  rating: StudyRating;
  input: string;
  hintUsed: boolean;
  elapsedMs: number;
  answeredAt: number;
  fsrsLog: ReviewLog;
}

export interface SceneLine {
  cardId: string;
  isNew: boolean; // 오늘 처음 배우는 표현 (먼저 보여주고 따라 말한 뒤 출제)
}

export interface Scene {
  id: string;
  theme: Theme; //  장소
  part: number; //  같은 장소가 길면 나눈 순번 (1부터)
  parts: number;
  lines: SceneLine[];
}

export interface DayLineResult {
  cardId: string;
  rating: StudyRating;
  firstTry: boolean; // 한 번에 말했는가 (good)
}

export interface DayLog {
  id: string;
  date: string; // YYYY-MM-DD (Asia/Seoul)
  scenes: Scene[];
  results: DayLineResult[]; // 답한 순서대로. 이어하기 위치 = results.length
  status: 'active' | 'done';
  startedAt: number;
  endedAt: number | null;
  stagesAtStart: Record<string, number>; // 하루 시작 때 정원 단계 (오늘 자란 식물 계산용)
  eveningChatDone?: boolean;
}

export interface MinedPhrase {
  id: string;
  ko: string;
  ja: string | null;
  note: string;
  createdAt: number;
  cardId: string | null;
}

export interface ChallengeOptions {
  noHint: boolean; //    힌트 없이
  timeLimit: boolean; // 익숙한 문장(stability >= 30)은 15초 안에
  voiceOnly: boolean; // 말로만 답하기
}

export interface Profile {
  dailyNewLimit: number;
  unlockedThemes: Theme[];
  challenge: ChallengeOptions;
  restTokens: number;
  streak: number;
}

export const DEFAULT_PROFILE: Profile = {
  dailyNewLimit: 15,
  unlockedThemes: ['konbini'],
  challenge: { noHint: false, timeLimit: false, voiceOnly: false },
  restTokens: 2,
  streak: 0,
};
