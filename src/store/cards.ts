import { create } from 'zustand';
import { seoulDateKey } from '../core/date';
import { activeDateKeys, computeStreak, computeUnlockedThemes } from '../core/meta';
import { DEFAULT_PROFILE, type DayLog, type MinedPhrase, type Profile, type StudyCard, type Theme } from '../core/types';
import {
  ensureSeeded,
  loadAnsweredTimes,
  loadCards,
  loadMinedPhrases,
  loadProfile,
  loadDays,
  saveProfile,
} from '../db/repository';

export type MetaNotice = { kind: 'theme'; theme: Theme };

interface CardsState {
  loaded: boolean;
  error: string | null;
  cards: StudyCard[];
  profile: Profile;
  days: DayLog[];
  minedPhrases: MinedPhrase[];
  notices: MetaNotice[]; // 새로 해금된 테마·유물
  init: () => Promise<void>;
  reload: () => Promise<void>;
  refreshMeta: () => Promise<void>;
  dismissNotices: () => void;
  replaceCard: (card: StudyCard) => void;
  addCard: (card: StudyCard) => void;
  upsertDay: (day: DayLog) => void;
  setMinedPhrases: (phrases: MinedPhrase[]) => void;
  setProfile: (profile: Profile) => Promise<void>;
}

export const useCardsStore = create<CardsState>((set, get) => ({
  loaded: false,
  error: null,
  cards: [],
  profile: { ...DEFAULT_PROFILE },
  days: [],
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
    const [cards, profile, days, minedPhrases] = await Promise.all([
      loadCards(),
      loadProfile(),
      loadDays(),
      loadMinedPhrases(),
    ]);
    set({ cards, profile, days, minedPhrases });
  },

  // 해금 장소·연속 기록을 기록에서 다시 계산해 저장한다.
  refreshMeta: async () => {
    const { cards, profile } = get();
    const unlockedThemes = computeUnlockedThemes(cards, profile.unlockedThemes);
    const { streak, restTokens } = computeStreak(activeDateKeys(await loadAnsweredTimes()), seoulDateKey(new Date()));
    const next: Profile = { ...profile, unlockedThemes, streak, restTokens };

    const notices: MetaNotice[] = unlockedThemes
      .filter((t) => !profile.unlockedThemes.includes(t))
      .map((theme): MetaNotice => ({ kind: 'theme', theme }));
    if (JSON.stringify(next) !== JSON.stringify(profile)) await saveProfile(next);
    set({ profile: next, notices: [...get().notices, ...notices] });
  },

  dismissNotices: () => set({ notices: [] }),

  replaceCard: (card) => set({ cards: get().cards.map((c) => (c.id === card.id ? card : c)) }),

  addCard: (card) => set({ cards: [...get().cards, card] }),

  upsertDay: (day) => {
    const days = get().days;
    set({ days: days.some((d) => d.id === day.id) ? days.map((d) => (d.id === day.id ? day : d)) : [...days, day] });
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
