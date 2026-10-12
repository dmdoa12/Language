import { create } from 'zustand';
import { chatTurn, isLlmEnabled, judgeAnswer, type ChatLine } from '../api/llm';
import { getReader } from '../api/japaneseReader';
import { gradeAnswer, isExactAnswer, type AnswerGrade } from '../core/answer';
import { combineGrade, needsJudge, type JudgeVerdict } from '../core/judge';
import { isDue, selectNewCards } from '../core/fsrs';
import { generateMap } from '../core/mapgen';
import { characterLevel } from '../core/meta';
import {
  abandonRun,
  answerCard,
  applyChatBonus,
  applyReward,
  buyHeal,
  buyRelic,
  chatPhraseIds,
  clearNode,
  createRun,
  currentNode,
  enterNode,
  EVENT_LABELS,
  eventEffectFor,
  isScheduledCard,
  leaveShop,
  REST_HEAL,
  remainingCardIds,
  rewardOptions,
  shopChoiceCount,
  type RewardOption,
} from '../core/run';
import { planRun } from '../core/session';
import type { Run } from '../core/types';
import { introduce, recordReview, saveRun, saveRunAndReview } from '../db/repository';
import { getCard, useCardsStore } from './cards';

export type Screen =
  | 'home'
  | 'review'
  | 'map'
  | 'battle'
  | 'shop'
  | 'reward'
  | 'result'
  | 'mining'
  | 'collection'
  | 'settings'
  | 'chat';

export interface BattleState {
  mode: 'node' | 'learn'; // learn: 상점에서 산 신규 카드 학습 (HP 영향 없음)
  cardId: string;
  phase: 'study' | 'question' | 'result';
  hintUsed: boolean;
  shownAt: number;
  lastInput: string;
  lastGrade: AnswerGrade | null;
  verdict: JudgeVerdict | null;
  copied: boolean;
  damage: number;
  negatedBy: string | null;
  recorded: boolean; // FSRS 에 기록했는가 (연습 출제면 false)
}

export interface ChatEntry extends ChatLine {
  ko?: string; //         직원 대사 번역
  correction?: string; // 학습자 발화 첨삭
}

export interface ChatState {
  phraseIds: string[];
  lines: ChatEntry[];
  usedIds: string[];
  loading: boolean;
  error: string | null;
  done: boolean;
}

export interface RewardState {
  nodeId: string;
  options: RewardOption[];
  notes: string[];
}

interface GameState {
  screen: Screen;
  run: Run | null;
  battle: BattleState | null;
  reward: RewardState | null;
  nodePerfect: boolean;
  busy: boolean;
  startLevel: number | null; // 결과 화면의 레벨 변화 표시용
  chat: ChatState | null;

  goHome: () => void;
  openReview: () => void;
  open: (screen: 'mining' | 'collection' | 'settings') => void;
  startRun: () => Promise<void>;
  resumeRun: () => void;
  abandon: () => Promise<void>;
  chooseNode: (nodeId: string) => Promise<void>;
  revealHint: () => void;
  submitAnswer: (input: string) => Promise<void>;
  submitCopy: (input: string) => boolean;
  finishStudy: (input: string) => boolean;
  continueAfterResult: () => Promise<void>;
  chooseReward: (option: RewardOption | null) => Promise<void>;
  shopOffers: () => string[];
  buyCard: (cardId: string) => Promise<void>;
  buyShopRelic: (relicId: string) => Promise<void>;
  buyShopHeal: () => Promise<void>;
  leaveShop: () => Promise<void>;
  startChat: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  finishChat: () => Promise<void>;
}

function newBattle(mode: BattleState['mode'], cardId: string, phase: BattleState['phase']): BattleState {
  return {
    mode,
    cardId,
    phase,
    hintUsed: false,
    shownAt: Date.now(),
    lastInput: '',
    lastGrade: null,
    verdict: null,
    copied: false,
    damage: 0,
    negatedBy: null,
    recorded: false,
  };
}

export function activeRun(runs: readonly Run[]): Run | null {
  return runs.find((r) => r.status === 'active') ?? null;
}

export const useGameStore = create<GameState>((set, get) => {
  const persistRun = async (run: Run) => {
    await saveRun(run);
    useCardsStore.getState().upsertRun(run);
    set({ run });
  };

  const nextNodeCard = async () => {
    const run = get().run!;
    const node = currentNode(run)!;
    const [cardId] = remainingCardIds(node);
    if (cardId) {
      set({ battle: newBattle('node', cardId, 'question'), screen: 'battle' });
      return;
    }
    await finishNode();
  };

  const finishNode = async () => {
    const before = get().run!;
    const node = currentNode(before)!;
    const run = clearNode(before, Date.now());
    await persistRun(run);
    if (run.status === 'won') {
      set({ battle: null, screen: 'result' });
      return;
    }
    const notes: string[] = [];
    if (node.type === 'rest') notes.push(`휴식처에서 쉬었다 (체력 +${REST_HEAL})`);
    if (node.type === 'event') notes.push(EVENT_LABELS[eventEffectFor(run.seed, node.id)]);
    const options = rewardOptions(run, node.id, get().nodePerfect);
    if (options.length === 0 && notes.length === 0) {
      set({ battle: null, reward: null, screen: 'map' });
      return;
    }
    set({ battle: null, reward: { nodeId: node.id, options, notes }, screen: 'reward' });
  };

  const turn = async (chat: ChatState) => {
    const run = get().run!;
    set({ chat: { ...chat, loading: true, error: null } });
    try {
      const phrases = chat.phraseIds.map((id) => getCard(id));
      const result = await chatTurn(
        run.mainTheme!,
        phrases,
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
      // 실패한 학습자 발화는 되돌려 다시 보낼 수 있게 한다
      const lines = chat.lines.at(-1)?.role === 'learner' ? chat.lines.slice(0, -1) : chat.lines;
      set({ chat: { ...chat, lines, loading: false, error: e instanceof Error ? e.message : String(e) } });
    }
  };

  return {
    screen: 'home',
    run: null,
    battle: null,
    reward: null,
    nodePerfect: true,
    busy: false,
    startLevel: null,
    chat: null,

    goHome: () => {
      set({ screen: 'home', battle: null, reward: null });
      void useCardsStore.getState().refreshMeta();
    },
    openReview: () => set({ screen: 'review' }),
    open: (screen) => set({ screen }),

    startRun: async () => {
      const { cards, runs, profile } = useCardsStore.getState();
      const now = new Date();
      const plan = planRun(cards, runs, now);
      const map = generateMap({ due: plan.due, leeches: plan.leeches, seed: plan.seed });
      const run = createRun({
        id: crypto.randomUUID(),
        seed: plan.seed,
        date: plan.date,
        nodes: map.nodes,
        mainTheme: map.mainTheme,
        practice: plan.practice,
        relicIds: profile.ownedRelicIds,
        startedAt: now.getTime(),
      });
      await persistRun(run);
      set({ screen: 'map', battle: null, reward: null, startLevel: characterLevel(cards) });
    },

    resumeRun: () => {
      const run = activeRun(useCardsStore.getState().runs);
      if (!run) return;
      set({ run, battle: null, reward: null, startLevel: null });
      const node = currentNode(run);
      if (node && !node.cleared) {
        if (node.type === 'shop') set({ screen: 'shop' });
        else {
          set({ nodePerfect: false });
          void nextNodeCard();
        }
      } else {
        set({ screen: 'map' });
      }
    },

    abandon: async () => {
      const run = get().run;
      if (!run) return;
      await persistRun(abandonRun(run, Date.now()));
      set({ screen: 'home', battle: null, reward: null });
    },

    chooseNode: async (nodeId) => {
      const run = enterNode(get().run!, nodeId);
      await persistRun(run);
      set({ nodePerfect: true });
      if (currentNode(run)!.type === 'shop') set({ screen: 'shop' });
      else await nextNodeCard();
    },

    revealHint: () => {
      const battle = get().battle;
      if (battle) set({ battle: { ...battle, hintUsed: true } });
    },

    submitAnswer: async (input) => {
      const { battle, run, busy } = get();
      if (!battle || battle.phase !== 'question' || !run || busy) return;
      set({ busy: true });
      try {
        const now = new Date();
        const card = getCard(battle.cardId);
        const local = gradeAnswer(card, input, battle.hintUsed, getReader() ?? undefined);
        const verdict = needsJudge(local) && isLlmEnabled() ? await judgeAnswer(card, input) : null;
        const grade = combineGrade(local, verdict, battle.hintUsed);
        const review = {
          card,
          rating: grade.rating,
          input,
          hintUsed: battle.hintUsed,
          elapsedMs: now.getTime() - battle.shownAt,
          runId: run.id,
          now,
        };
        const result = {
          ...battle,
          phase: 'result' as const,
          lastInput: input,
          lastGrade: grade,
          verdict,
          copied: grade.rating !== 'again',
        };

        if (battle.mode === 'learn') {
          const { card: updated } = await recordReview(review);
          useCardsStore.getState().replaceCard(updated);
          set({ battle: { ...result, recorded: true } });
          return;
        }

        const node = currentNode(run)!;
        // 층 batch 카드라도 그사이 빠른 복습 등으로 due 가 아니게 됐으면 기록하지 않는다.
        const scheduled = isScheduledCard(node, card.id) && isDue(card, now);
        const outcome = answerCard(run, card.id, grade.rating, battle.hintUsed, now.getTime());
        const updated = await saveRunAndReview(outcome.run, scheduled ? review : null);
        if (updated) useCardsStore.getState().replaceCard(updated);
        useCardsStore.getState().upsertRun(outcome.run);
        set({
          run: outcome.run,
          nodePerfect: get().nodePerfect && (!scheduled || grade.rating === 'good'),
          battle: { ...result, damage: outcome.damage, negatedBy: outcome.negatedBy, recorded: scheduled },
        });
      } finally {
        set({ busy: false });
      }
    },

    submitCopy: (input) => {
      const battle = get().battle;
      if (!battle || !isExactAnswer(getCard(battle.cardId), input, getReader() ?? undefined)) return false;
      set({ battle: { ...battle, copied: true } });
      return true;
    },

    finishStudy: (input) => {
      const battle = get().battle;
      if (!battle || battle.phase !== 'study' || !isExactAnswer(getCard(battle.cardId), input, getReader() ?? undefined)) return false;
      set({ battle: { ...battle, phase: 'question', shownAt: Date.now() } });
      return true;
    },

    continueAfterResult: async () => {
      const { battle, run } = get();
      if (!battle || !run) return;
      if (run.status === 'dead') {
        set({ battle: null, screen: 'result' });
        return;
      }
      if (battle.mode === 'learn') {
        set({ battle: null, screen: 'shop' });
        return;
      }
      await nextNodeCard();
    },

    chooseReward: async (option) => {
      const run = get().run!;
      if (option) await persistRun(applyReward(run, option));
      set({ reward: null, screen: 'map' });
    },

    shopOffers: () => {
      const run = get().run;
      if (!run) return [];
      const { cards, profile } = useCardsStore.getState();
      return selectNewCards(cards, profile.unlockedThemes, profile.dailyNewLimit, new Date())
        .slice(0, shopChoiceCount(run))
        .map((c) => c.id);
    },

    buyCard: async (cardId) => {
      if (!get().shopOffers().includes(cardId)) return;
      const introduced = await introduce(getCard(cardId), new Date());
      useCardsStore.getState().replaceCard(introduced);
      set({ battle: newBattle('learn', cardId, 'study'), screen: 'battle' });
    },

    buyShopRelic: async (relicId) => {
      await persistRun(buyRelic(get().run!, relicId));
    },

    buyShopHeal: async () => {
      await persistRun(buyHeal(get().run!));
    },

    leaveShop: async () => {
      await persistRun(leaveShop(get().run!, Date.now()));
      set({ screen: 'map' });
    },

    // 보스 대화: FSRS·체력과 무관한 보너스. 쓴 오늘의 표현 수만큼 골드.
    startChat: async () => {
      const run = get().run;
      if (!run || !run.mainTheme || !isLlmEnabled() || run.chatBonusClaimed) return;
      const phraseIds = chatPhraseIds(run, (id) => useCardsStore.getState().cards.find((c) => c.id === id)?.theme);
      const chat: ChatState = { phraseIds, lines: [], usedIds: [], loading: true, error: null, done: false };
      set({ chat, screen: 'chat' });
      await turn(chat);
    },

    sendChat: async (text) => {
      const chat = get().chat;
      if (!chat || chat.loading || chat.done) return;
      await turn({ ...chat, lines: [...chat.lines, { role: 'learner', text }] });
    },

    finishChat: async () => {
      const { run, chat } = get();
      if (run && chat && !run.chatBonusClaimed) await persistRun(applyChatBonus(run, chat.usedIds.length));
      set({ chat: null, screen: 'result' });
    },
  };
});
