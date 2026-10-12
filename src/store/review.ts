import { create } from 'zustand';
import { gradeAnswer, isExactAnswer, type AnswerGrade } from '../core/answer';
import { pickNextStep } from '../core/session';
import type { StudyCard } from '../core/types';
import { recordReview } from '../db/repository';
import { useCardsStore } from './cards';

// 빠른 복습: 맵 없이 due 카드만 푼다. 신규 도입은 상점 담당.
export type ReviewPhase = 'idle' | 'question' | 'result' | 'done';

interface SessionStats {
  reviewed: number;
  good: number;
  hard: number;
  again: number;
}

const EMPTY_STATS: SessionStats = { reviewed: 0, good: 0, hard: 0, again: 0 };

interface ReviewState {
  phase: ReviewPhase;
  current: StudyCard | null;
  hintUsed: boolean;
  shownAt: number;
  lastInput: string;
  lastGrade: AnswerGrade | null;
  copied: boolean;
  nextDueAt: number | null;
  stats: SessionStats;

  start: () => void;
  stop: () => void;
  revealHint: () => void;
  submitAnswer: (input: string) => Promise<void>;
  submitCopy: (input: string) => boolean;
  next: () => void;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  phase: 'idle',
  current: null,
  hintUsed: false,
  shownAt: 0,
  lastInput: '',
  lastGrade: null,
  copied: false,
  nextDueAt: null,
  stats: EMPTY_STATS,

  start: () => {
    set({ stats: EMPTY_STATS });
    get().next();
  },

  stop: () => set({ phase: 'idle', current: null }),

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
    useCardsStore.getState().replaceCard(card);
    set({
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

  next: () => {
    const { cards, profile } = useCardsStore.getState();
    const now = new Date();
    const step = pickNextStep(cards, profile, now, { allowNew: false });
    const base = { hintUsed: false, lastInput: '', lastGrade: null, copied: false, shownAt: now.getTime() };
    if (step.kind === 'done') {
      set({ ...base, phase: 'done', current: null, nextDueAt: step.nextDueAt });
    } else {
      set({ ...base, phase: 'question', current: step.card });
    }
  },
}));
