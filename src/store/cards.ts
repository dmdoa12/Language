import { create } from 'zustand';
import { seoulDateKey } from '../core/date';
import { activeDateKeys, computeOwnedRelics, computeStreak, computeUnlockedThemes } from '../core/meta';
import { DEFAULT_PROFILE, type MinedPhrase, type Profile, type Run, type StudyCard, type Theme } from '../core/types';
import {
  ensureSeeded,
  loadAnsweredTimes,
  loadCards,
  loadMinedPhrases,
  loadProfile,
  loadRuns,
  saveProfile,
} from '../db/repository';

export type MetaNotice = { kind: 'theme'; theme: Theme } | { kind: 'relic'; relicId: string };

interface CardsState {
  loaded: boolean;
  error: string | null;
  cards: StudyCard[];
  profile: Profile;
  runs: Run[];
  minedPhrases: MinedPhrase[];
  notices: MetaNotice[]; // 새로 해금된 테마·유물
  init: () => Promise<void>;
  reload: () => Promise<void>;
  refreshMeta: () => Promise<void>;
  dismissNotices: () => void;
  replaceCard: (card: StudyCard) => void;
  addCard: (card: StudyCard) => void;
  upsertRun: (run: Run) => void;
  setMinedPhrases: (phrases: MinedPhrase[]) => void;
  setProfile: (profile: Profile) => Promise<void>;
}

export const useCardsStore = create<CardsState>((set, get) => ({
  loaded: false,
  error: null,
  cards: [],
  profile: { ...DEFAULT_PROFILE },
  runs: [],
  minedPhrases: [],
  notices: [],

  init: async () => {
    try {
      await ensureSeeded(new Date());
      await get().reload();
      await get().refreshMeta();
      set({ loaded: true, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  reload: async () => {
    const [cards, profile, runs, minedPhrases] = await Promise.all([
      loadCards(),
      loadProfile(),
      loadRuns(),
      loadMinedPhrases(),
    ]);
    set({ cards, profile, runs, minedPhrases });
  },

  // 해금 테마·희귀 유물·연속 기록을 기록에서 다시 계산해 저장한다.
  refreshMeta: async () => {
    const { cards, profile } = get();
    const unlockedThemes = computeUnlockedThemes(cards, profile.unlockedThemes);
    const ownedRelicIds = computeOwnedRelics(cards, profile.ownedRelicIds);
    const { streak, restTokens } = computeStreak(activeDateKeys(await loadAnsweredTimes()), seoulDateKey(new Date()));
    const next: Profile = { ...profile, unlockedThemes, ownedRelicIds, streak, restTokens };

    const notices: MetaNotice[] = [
      ...unlockedThemes
        .filter((t) => !profile.unlockedThemes.includes(t))
        .map((theme): MetaNotice => ({ kind: 'theme', theme })),
      ...ownedRelicIds
        .filter((id) => !profile.ownedRelicIds.includes(id))
        .map((relicId): MetaNotice => ({ kind: 'relic', relicId })),
    ];
    if (JSON.stringify(next) !== JSON.stringify(profile)) await saveProfile(next);
    set({ profile: next, notices: [...get().notices, ...notices] });
  },

  dismissNotices: () => set({ notices: [] }),

  replaceCard: (card) => set({ cards: get().cards.map((c) => (c.id === card.id ? card : c)) }),

  addCard: (card) => set({ cards: [...get().cards, card] }),

  upsertRun: (run) => {
    const runs = get().runs;
    set({ runs: runs.some((r) => r.id === run.id) ? runs.map((r) => (r.id === run.id ? run : r)) : [...runs, run] });
  },

  setMinedPhrases: (minedPhrases) => set({ minedPhrases }),

  setProfile: async (profile) => {
    await saveProfile(profile);
    set({ profile });
  },
}));

export function getCard(id: string): StudyCard {
  const card = useCardsStore.getState().cards.find((c) => c.id === id);
  if (!card) throw new Error(`unknown card ${id}`);
  return card;
}
