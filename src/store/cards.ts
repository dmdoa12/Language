import { create } from 'zustand';
import { DEFAULT_PROFILE, type Profile, type Run, type StudyCard } from '../core/types';
import { ensureSeeded, loadCards, loadProfile, loadRuns } from '../db/repository';

interface CardsState {
  loaded: boolean;
  error: string | null;
  cards: StudyCard[];
  profile: Profile;
  runs: Run[];
  init: () => Promise<void>;
  replaceCard: (card: StudyCard) => void;
  upsertRun: (run: Run) => void;
}

export const useCardsStore = create<CardsState>((set, get) => ({
  loaded: false,
  error: null,
  cards: [],
  profile: { ...DEFAULT_PROFILE },
  runs: [],

  init: async () => {
    try {
      await ensureSeeded(new Date());
      const [cards, profile, runs] = await Promise.all([loadCards(), loadProfile(), loadRuns()]);
      set({ cards, profile, runs, loaded: true, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  replaceCard: (card) => set({ cards: get().cards.map((c) => (c.id === card.id ? card : c)) }),

  upsertRun: (run) => {
    const runs = get().runs;
    set({ runs: runs.some((r) => r.id === run.id) ? runs.map((r) => (r.id === run.id ? run : r)) : [...runs, run] });
  },
}));

export function getCard(id: string): StudyCard {
  const card = useCardsStore.getState().cards.find((c) => c.id === id);
  if (!card) throw new Error(`unknown card ${id}`);
  return card;
}
