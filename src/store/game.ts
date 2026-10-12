import { create } from 'zustand';
import { gradeAnswer, isExactAnswer, type AnswerGrade } from '../core/answer';
import { isDue, selectNewCards } from '../core/fsrs';
import { generateMap } from '../core/mapgen';
import {
  abandonRun,
  answerCard,
  applyReward,
  buyHeal,
  buyRelic,
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

export type Screen = 'home' | 'review' | 'map' | 'battle' | 'shop' | 'reward' | 'result';

export interface BattleState {
  mode: 'node' | 'learn'; // learn: 상점에서 산 신규 카드 학습 (HP 영향 없음)
  cardId: string;
  phase: 'study' | 'question' | 'result';
  hintUsed: boolean;
  shownAt: number;
  lastInput: string;
  lastGrade: AnswerGrade | null;
  copied: boolean;
  damage: number;
  negatedBy: string | null;
  recorded: boolean; // FSRS 에 기록했는가 (연습 출제면 false)
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

  goHome: () => void;
  openReview: () => void;
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

  return {
    screen: 'home',
    run: null,
    battle: null,
    reward: null,
    nodePerfect: true,
    busy: false,

    goHome: () => set({ screen: 'home', battle: null, reward: null }),
    openReview: () => set({ screen: 'review' }),

    startRun: async () => {
      const { cards, runs } = useCardsStore.getState();
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
        startedAt: now.getTime(),
      });
      await persistRun(run);
      set({ screen: 'map', battle: null, reward: null });
    },

    resumeRun: () => {
      const run = activeRun(useCardsStore.getState().runs);
      if (!run) return;
      set({ run, battle: null, reward: null });
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
        const grade = gradeAnswer(card, input, battle.hintUsed);
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
      if (!battle || !isExactAnswer(getCard(battle.cardId), input)) return false;
      set({ battle: { ...battle, copied: true } });
      return true;
    },

    finishStudy: (input) => {
      const battle = get().battle;
      if (!battle || battle.phase !== 'study' || !isExactAnswer(getCard(battle.cardId), input)) return false;
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
  };
});
