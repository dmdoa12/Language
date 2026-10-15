import { create } from 'zustand';
import { downloadSync, findOrCreateGist, GistError, uploadSync } from '../api/gist';
import { BACKUP_VERSION, parseBackup, serializeBackup } from '../core/backup';
import { mergeSnapshots, type Snapshot } from '../core/sync';
import { ensureSeeded, exportSnapshot, importAll } from '../db/repository';
import { useCardsStore } from './cards';

// 동기화 설정은 이 기기에만 저장 (토큰 포함)
const CONFIG_KEY = 'jp-talk-sync';
const MIN_INTERVAL_MS = 30_000;

export interface SyncConfig {
  token: string;
  gistId: string;
  lastSyncedAt: number | null;
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SyncConfig>;
    if (typeof v.token !== 'string' || typeof v.gistId !== 'string' || !v.token || !v.gistId) return null;
    return { token: v.token, gistId: v.gistId, lastSyncedAt: typeof v.lastSyncedAt === 'number' ? v.lastSyncedAt : null };
  } catch {
    return null;
  }
}

function saveSyncConfig(config: SyncConfig | null): void {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    // 저장소를 못 쓰면 이번 세션만
  }
}

// 비교용: 내보낸 시각과 기기마다 다시 계산되는 값(연속 기록·휴식권)을 뺀 내용
function contentKey(s: Snapshot): string {
  return JSON.stringify({ ...s, exportedAt: 0, profile: { ...s.profile, streak: 0, restTokens: 0 } });
}

interface SyncState {
  config: SyncConfig | null;
  syncing: boolean;
  error: string | null;
  lastChanged: boolean; // 마지막 동기화에서 다른 기기 기록을 받아왔는가
  connect: (token: string) => Promise<void>;
  disconnect: () => void;
  syncNow: (opts?: { force?: boolean }) => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  config: loadSyncConfig(),
  syncing: false,
  error: null,
  lastChanged: false,

  connect: async (token) => {
    set({ syncing: true, error: null });
    try {
      const gistId = await findOrCreateGist(token.trim());
      const config = { token: token.trim(), gistId, lastSyncedAt: null };
      saveSyncConfig(config);
      set({ config, syncing: false });
      await get().syncNow({ force: true });
    } catch (e) {
      set({ syncing: false, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  disconnect: () => {
    saveSyncConfig(null);
    set({ config: null, error: null });
  },

  // 원격 기록을 받아 로컬과 합치고, 합친 결과를 양쪽에 저장한다.
  syncNow: async (opts = {}) => {
    const config = get().config;
    if (!config || get().syncing) return;
    // 너무 잦은 동기화는 건너뛰되, 이 기기에 아직 올리지 않은 변경이 있으면 바로 올린다
    const unsynced = useCardsStore.getState().changedAt > (config.lastSyncedAt ?? 0);
    if (!opts.force && !unsynced && config.lastSyncedAt && Date.now() - config.lastSyncedAt < MIN_INTERVAL_MS) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    set({ syncing: true, error: null });
    try {
      const remoteText = await downloadSync(config.token, config.gistId);
      const remote = remoteText ? parseBackup(remoteText) : null;
      const local = await exportSnapshot(Date.now());
      const merged = mergeSnapshots(local, remote);

      const changedLocal = contentKey(merged) !== contentKey(local);
      if (changedLocal) {
        await importAll({ version: BACKUP_VERSION, ...merged });
        await ensureSeeded(new Date());
        const cards = useCardsStore.getState();
        await cards.reload();
        await cards.refreshMeta();
      }
      if (!remote || contentKey(merged) !== contentKey(remote)) {
        await uploadSync(config.token, config.gistId, serializeBackup(merged));
      }
      const next = { ...config, lastSyncedAt: Date.now() };
      saveSyncConfig(next);
      set({ config: next, syncing: false, lastChanged: changedLocal });
    } catch (e) {
      const message = e instanceof GistError || e instanceof Error ? e.message : String(e);
      set({ syncing: false, error: `동기화 실패: ${message}` });
    }
  },
}));
