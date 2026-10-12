import { create } from 'zustand';
import { getReader } from '../api/japaneseReader';
import { chatTurn, isLlmEnabled, judgeAnswer, type ChatLine } from '../api/llm';
import { gradeAnswer, isExactAnswer, type AnswerGrade } from '../core/answer';
import { seoulDateKey } from '../core/date';
import {
  createDayLog,
  currentPosition,
  eveningChatPhraseIds,
  eveningChatTheme,
  justFinishedScene,
  recordLine,
} from '../core/day';
import { planDay } from '../core/dayplan';
import { isDue, selectDueCards, selectNewCards } from '../core/fsrs';
import { stageSnapshot } from '../core/garden';
import { combineGrade, needsJudge, type JudgeVerdict } from '../core/judge';
import { characterLevel } from '../core/meta';
import type { DayLog } from '../core/types';
import { introduce, saveDay, saveDayAndReview } from '../db/repository';
import { getCard, useCardsStore } from './cards';

export type Screen =
  | 'home'
  | 'day' //          장면 진행
  | 'sceneResult' //  장면 사이 결과
  | 'summary' //      하루 요약
  | 'chat' //         하루 마무리 대화 (AI 선택)
  | 'review' //       잊기 전에 한 번 더 (빠른 복습)
  | 'garden'
  | 'mining'
  | 'settings';

export interface LineState {
  cardId: string;
  isNew: boolean;
  phase: 'intro' | 'study' | 'question' | 'result'; // intro: 장면 시작 안내
  hintUsed: boolean;
  shownAt: number;
  lastInput: string;
  lastGrade: AnswerGrade | null;
  verdict: JudgeVerdict | null;
  copied: boolean;
  recorded: boolean; // FSRS 에 기록했는가 (오늘 이미 다른 데서 복습했으면 false)
}

export interface ChatEntry extends ChatLine {
  ko?: string;
  correction?: string;
}

export interface ChatState {
  phraseIds: string[];
  lines: ChatEntry[];
  usedIds: string[];
  loading: boolean;
  error: string | null;
  done: boolean;
}

interface DayState {
  screen: Screen;
  day: DayLog | null;
  line: LineState | null;
  lastSceneIndex: number | null; // sceneResult 화면에서 보여줄 장면
  busy: boolean;
  startLevel: number | null;
  chat: ChatState | null;

  goHome: () => void;
  open: (screen: 'garden' | 'mining' | 'settings' | 'review' | 'summary') => void;
  todayDay: () => DayLog | null;
  startOrResumeDay: () => Promise<void>;
  beginScene: () => void;
  revealHint: () => void;
  finishStudy: (input: string) => boolean;
  submitAnswer: (input: string) => Promise<void>;
  submitCopy: (input: string) => boolean;
  continueAfterResult: () => void;
  continueAfterScene: () => void;
  startChat: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  finishChat: () => Promise<void>;
}

function reader() {
  return getReader() ?? undefined;
}

export const useDayStore = create<DayState>((set, get) => {
  const persistDay = async (day: DayLog) => {
    await saveDay(day);
    useCardsStore.getState().upsertDay(day);
    set({ day });
  };

  // 현재 위치의 줄을 준비한다. 장면 첫 줄이면 장면 안내부터.
  const prepareLine = (day: DayLog, showIntro: boolean) => {
    const pos = currentPosition(day);
    if (!pos) {
      set({ line: null, screen: 'summary' });
      return;
    }
    set({
      screen: 'day',
      line: {
        cardId: pos.line.cardId,
        isNew: pos.line.isNew,
        phase: showIntro && pos.lineIndex === 0 ? 'intro' : pos.line.isNew ? 'study' : 'question',
        hintUsed: false,
        shownAt: Date.now(),
        lastInput: '',
        lastGrade: null,
        verdict: null,
        copied: false,
        recorded: false,
      },
    });
  };

  const turn = async (chat: ChatState) => {
    const day = get().day!;
    const theme = eveningChatTheme(day);
    if (!theme) return;
    set({ chat: { ...chat, loading: true, error: null } });
    try {
      const result = await chatTurn(
        theme,
        chat.phraseIds.map((id) => getCard(id)),
        chat.lines.map(({ role, text }) => ({ role, text })),
      );
      const lines = [...chat.lines];
      const last = lines.at(-1);
      if (last?.role === 'learner' && result.correction) lines[lines.length - 1] = { ...last, correction: result.correction };
      lines.push({ role: 'staff', text: result.reply, ko: result.replyKo });
      set({
        chat: {
          ...chat,
          lines,
          usedIds: [...new Set([...chat.usedIds, ...result.usedPhraseIds])],
          loading: false,
          done: result.done,
        },
      });
    } catch (e) {
      const lines = chat.lines.at(-1)?.role === 'learner' ? chat.lines.slice(0, -1) : chat.lines;
      set({ chat: { ...chat, lines, loading: false, error: e instanceof Error ? e.message : String(e) } });
    }
  };

  return {
    screen: 'home',
    day: null,
    line: null,
    lastSceneIndex: null,
    busy: false,
    startLevel: null,
    chat: null,

    goHome: () => {
      set({ screen: 'home', line: null, chat: null });
      void useCardsStore.getState().refreshMeta();
    },

    open: (screen) => {
      if (screen === 'summary') set({ day: get().todayDay() });
      set({ screen });
    },

    todayDay: () => {
      const today = seoulDateKey(new Date());
      return useCardsStore.getState().days.find((d) => d.date === today) ?? null;
    },

    startOrResumeDay: async () => {
      const existing = get().todayDay();
      if (existing) {
        set({ day: existing });
        if (existing.status === 'done') set({ screen: 'summary', line: null });
        else prepareLine(existing, true);
        return;
      }
      const { cards, profile } = useCardsStore.getState();
      const now = new Date();
      const scenes = planDay({
        due: selectDueCards(cards, now),
        fresh: selectNewCards(cards, profile.unlockedThemes, profile.dailyNewLimit, now),
      });
      const day = createDayLog({
        id: crypto.randomUUID(),
        date: seoulDateKey(now),
        scenes,
        startedAt: now.getTime(),
        stagesAtStart: stageSnapshot(cards),
      });
      await persistDay(day);
      set({ startLevel: characterLevel(cards) });
      if (day.status === 'done') set({ screen: 'summary', line: null });
      else prepareLine(day, true);
    },

    beginScene: () => {
      const line = get().line;
      if (!line || line.phase !== 'intro') return;
      set({ line: { ...line, phase: line.isNew ? 'study' : 'question', shownAt: Date.now() } });
    },

    revealHint: () => {
      const line = get().line;
      if (line && !useCardsStore.getState().profile.challenge.noHint) set({ line: { ...line, hintUsed: true } });
    },

    // 새 표현: 보여주고 따라 입력하면 배운 것으로 (FSRS 시작) 표시하고 출제.
    finishStudy: (input) => {
      const line = get().line;
      if (!line || line.phase !== 'study' || !isExactAnswer(getCard(line.cardId), input, reader())) return false;
      const card = getCard(line.cardId);
      if (card.introducedAt === null) {
        void introduce(card, new Date()).then((c) => useCardsStore.getState().replaceCard(c));
      }
      set({ line: { ...line, phase: 'question', shownAt: Date.now() } });
      return true;
    },

    submitAnswer: async (input) => {
      const { line, day, busy } = get();
      if (!line || line.phase !== 'question' || !day || busy) return;
      set({ busy: true });
      try {
        const now = new Date();
        let card = getCard(line.cardId);
        // 따라 입력 직후라 아직 저장 중일 수 있다: 새 표현은 여기서 확실히 배운 것으로
        if (card.introducedAt === null) {
          card = await introduce(card, now);
          useCardsStore.getState().replaceCard(card);
        }
        const local = gradeAnswer(card, input, line.hintUsed, reader());
        const verdict = needsJudge(local) && isLlmEnabled() ? await judgeAnswer(card, input) : null;
        const grade = combineGrade(local, verdict, line.hintUsed);
        // 오늘 이미 빠른 복습 등으로 due 가 아니게 된 카드는 다시 기록하지 않는다
        const recorded = isDue(card, now);
        const next = recordLine(day, card.id, grade.rating, now.getTime());
        const updated = await saveDayAndReview(
          next,
          recorded
            ? {
                card,
                rating: grade.rating,
                input,
                hintUsed: line.hintUsed,
                elapsedMs: now.getTime() - line.shownAt,
                dayId: day.id,
                now,
              }
            : null,
        );
        if (updated) useCardsStore.getState().replaceCard(updated);
        useCardsStore.getState().upsertDay(next);
        set({
          day: next,
          line: {
            ...line,
            phase: 'result',
            lastInput: input,
            lastGrade: grade,
            verdict,
            copied: grade.rating !== 'again',
            recorded,
          },
        });
      } finally {
        set({ busy: false });
      }
    },

    submitCopy: (input) => {
      const line = get().line;
      if (!line || !isExactAnswer(getCard(line.cardId), input, reader())) return false;
      set({ line: { ...line, copied: true } });
      return true;
    },

    continueAfterResult: () => {
      const day = get().day;
      if (!day) return;
      const finished = justFinishedScene(day);
      if (finished !== null) {
        set({ screen: 'sceneResult', lastSceneIndex: finished, line: null });
        return;
      }
      prepareLine(day, true);
    },

    continueAfterScene: () => {
      const day = get().day;
      if (!day) return;
      if (day.status === 'done') {
        set({ screen: 'summary', line: null });
        void useCardsStore.getState().refreshMeta();
        return;
      }
      prepareLine(day, true);
    },

    startChat: async () => {
      const day = get().day;
      if (!day || day.status !== 'done' || day.eveningChatDone || !isLlmEnabled() || !eveningChatTheme(day)) return;
      const chat: ChatState = {
        phraseIds: eveningChatPhraseIds(day),
        lines: [],
        usedIds: [],
        loading: true,
        error: null,
        done: false,
      };
      set({ chat, screen: 'chat' });
      await turn(chat);
    },

    sendChat: async (text) => {
      const chat = get().chat;
      if (!chat || chat.loading || chat.done) return;
      await turn({ ...chat, lines: [...chat.lines, { role: 'learner', text }] });
    },

    finishChat: async () => {
      const day = get().day;
      if (day && !day.eveningChatDone) await persistDay({ ...day, eveningChatDone: true });
      set({ chat: null, screen: 'summary' });
    },
  };
});
