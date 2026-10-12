import { isJudgeVerdict, type JudgeVerdict } from '../core/judge';
import type { StudyCard, Theme } from '../core/types';

// Worker 주소와 접속 암호는 이 기기 브라우저에만 저장한다 (Claude API 키는 Worker 에만 있다).
export interface LlmConfig {
  endpoint: string;
  accessKey: string;
}

const STORAGE_KEY = 'jp-talk-llm';
const JUDGE_TIMEOUT_MS = 12_000;
const CHAT_TIMEOUT_MS = 30_000;

export function loadLlmConfig(): LlmConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LlmConfig>;
    if (typeof v.endpoint !== 'string' || typeof v.accessKey !== 'string' || !v.endpoint || !v.accessKey) return null;
    return { endpoint: v.endpoint, accessKey: v.accessKey };
  } catch {
    return null;
  }
}

export function saveLlmConfig(config: LlmConfig | null): void {
  try {
    if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 못 쓰는 환경이면 이번 세션만 쓰지 못한다
  }
}

export function isLlmEnabled(): boolean {
  return loadLlmConfig() !== null && (typeof navigator === 'undefined' || navigator.onLine !== false);
}

export class LlmError extends Error {}

async function call<T>(config: LlmConfig, path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.endpoint.replace(/\/+$/, '')}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Access-Key': config.accessKey },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new LlmError(body.error ?? `AI 서버 오류 (${res.status})`);
    return body as T;
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new LlmError('AI 응답이 늦어 건너뛰었어요.');
    throw new LlmError('AI 서버에 연결하지 못했어요.');
  } finally {
    clearTimeout(timer);
  }
}

export async function checkConnection(config: LlmConfig): Promise<void> {
  await call(config, '/health', { method: 'GET' }, JUDGE_TIMEOUT_MS);
}

// 실패하면 null (로컬 판정으로 진행).
export async function judgeAnswer(card: StudyCard, input: string): Promise<JudgeVerdict | null> {
  const config = loadLlmConfig();
  if (!config || !isLlmEnabled()) return null;
  try {
    const result = await call<unknown>(
      config,
      '/judge',
      {
        method: 'POST',
        body: JSON.stringify({
          target: { ja: card.ja, readings: card.readings, ko: card.ko, situation: card.situation },
          input,
        }),
      },
      JUDGE_TIMEOUT_MS,
    );
    return isJudgeVerdict(result) ? result : null;
  } catch {
    return null;
  }
}

export interface ChatLine {
  role: 'staff' | 'learner';
  text: string;
}

export interface ChatTurnResult {
  reply: string;
  replyKo: string;
  usedPhraseIds: string[];
  correction: string | null;
  done: boolean;
}

export async function chatTurn(
  theme: Theme,
  phrases: Pick<StudyCard, 'id' | 'ja' | 'ko'>[],
  history: ChatLine[],
): Promise<ChatTurnResult> {
  const config = loadLlmConfig();
  if (!config) throw new LlmError('설정에서 AI 서버를 먼저 연결해 주세요.');
  return call<ChatTurnResult>(
    config,
    '/chat',
    { method: 'POST', body: JSON.stringify({ theme, phrases: phrases.map(({ id, ja, ko }) => ({ id, ja, ko })), history }) },
    CHAT_TIMEOUT_MS,
  );
}
