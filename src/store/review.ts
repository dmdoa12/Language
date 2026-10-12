import { create } from 'zustand';
import { gradeAnswer, isExactAnswer, type AnswerGrade } from '../core/answer';
import { pickNextStep, summarizeToday, type TodaySummary } from '../core/session';
import { DEFAULT_PROFILE, type Profile, type StudyCard } from '../core/types';
import { ensureSeeded, introduce, loadCards, loadProfile, recordReview } from '../db/repository';

export type ReviewPhase =
  | 'loading'
  | 'home'
  | 'study' //    신규 카드 소개: 정답을 보고 한 번 따라 입력
  | 'question' // 한국어 상황 → 일본어 입력
  | 'result' //   판정 표시 (오답이면 따라 입력해야 진행)
  | 'done';

interface SessionStats {
  reviewed: number;
  good: number;
  hard: number;
  again: number;
  introduced: number;
}

const EMPTY_STATS: SessionStats = { reviewed: 0, good: 0, hard: 0, again: 0, introduced: 0 };

interface ReviewState {
  phase: ReviewPhase;
  error: string | null;
  cards: StudyCard[];
  profile: Profile;
  today: TodaySummary;
  current: StudyCard | null;
  hintUsed: boolean;
  shownAt: number;
  lastInput: string;
  lastGrade: AnswerGrade | null;
  copied: boolean;
  nextDueAt: number | null;
  stats: SessionStats;

  init: () => Promise<void>;
  startSession: () => void;
  goHome: () => void;
  revealHint: () => void;
  submitAnswer: (input: string) => Promise<void>;
  submitCopy: (input: string) => boolean;
  finishStudy: (input: string) => Promise<boolean>;
  next: () => void;
}

function replaceCard(cards: StudyCard[], card: StudyCard): StudyCard[] {
  return cards.map((c) => (c.id === card.id ? card : c));
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  phase: 'loading',
  error: null,
  cards: [],
  profile: { ...DEFAULT_PROFILE },
  today: { dueCount: 0, newAvailable: 0 },
  current: null,
  hintUsed: false,
  shownAt: 0,
  lastInput: '',
  lastGrade: null,
  copied: false,
  nextDueAt: null,
  stats: EMPTY_STATS,

  init: async () => {
    try {
      const now = new Date();
      await ensureSeeded(now);
      const [cards, profile] = await Promise.all([loadCards(), loadProfile()]);
      set({ cards, profile, today: summarizeToday(cards, profile, now), phase: 'home', error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  startSession: () => {
    set({ stats: EMPTY_STATS });
    get().next();
  },

  goHome: () => {
    const { cards, profile } = get();
    set({ phase: 'home', current: null, today: summarizeToday(cards, profile, new Date()) });
  },

  revealHint: () => set({ hintUsed: true }),

  submitAnswer: async (input) => {
    const { current, hintUsed, shownAt, phase, stats } = get();
    if (!current || phase !== 'question') return;
    const now = new Date();
    const grade = gradeAnswer(current, input, hintUsed);
    const { card } = await recordReview({
      card: current,
      rating: grade.rating,
      input,
      hintUsed,
      elapsedMs: now.getTime() - shownAt,
      runId: null,
      now,
    });
    set({
      cards: replaceCard(get().cards, card),
      current: card,
      lastInput: input,
      lastGrade: grade,
      copied: grade.rating !== 'again',
      phase: 'result',
      stats: { ...stats, reviewed: stats.reviewed + 1, [grade.rating]: stats[grade.rating] + 1 },
    });
  },

  // 오답 후 따라 입력. 등급은 바뀌지 않는다.
  submitCopy: (input) => {
    const { current } = get();
    if (!current || !isExactAnswer(current, input)) return false;
    set({ copied: true });
    return true;
  },

  finishStudy: async (input) => {
    const { current, phase, stats } = get();
    if (!current || phase !== 'study' || !isExactAnswer(current, input)) return false;
    const card = await introduce(current, new Date());
    set({
      cards: replaceCard(get().cards, card),
      stats: { ...stats, introduced: stats.introduced + 1 },
    });
    get().next();
    return true;
  },

  next: () => {
    const { cards, profile } = get();
    const now = new Date();
    const step = pickNextStep(cards, profile, now);
    const base = { hintUsed: false, lastInput: '', lastGrade: null, copied: false, shownAt: now.getTime() };
    switch (step.kind) {
      case 'review':
        set({ ...base, phase: 'question', current: step.card });
        break;
      case 'new':
        set({ ...base, phase: 'study', current: step.card });
        break;
      case 'done':
        set({ ...base, phase: 'done', current: null, nextDueAt: step.nextDueAt });
        break;
    }
  },
}));
