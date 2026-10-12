import { isJudgeVerdict, type JudgeVerdict } from '../core/judge';
import {
  buildChatCall,
  buildJudgeCall,
  parseChatRequest,
  parseChatResponse,
  parseJudgeRequest,
  parseJudgeResponse,
  resultText,
  type ChatResponse,
} from '../core/llmPrompts';
import type { StudyCard, Theme } from '../core/types';

// AI 연결 방식 (이 기기 브라우저에만 저장):
// - direct: 본인 Claude API 키로 브라우저에서 직접 호출 (전용 키 + 콘솔 사용 한도 권장)
// - worker: Cloudflare Worker 경유 (API 키는 Worker 에만, 앱에는 주소와 접속 암호)
export type LlmConfig =
  | { mode: 'direct'; apiKey: string; judgeModel?: string; chatModel?: string }
  | { mode: 'worker'; endpoint: string; accessKey: string };

const STORAGE_KEY = 'jp-talk-llm';
const USAGE_KEY = 'jp-talk-llm-usage';
export const DIRECT_DAILY_LIMIT = 300;
const JUDGE_TIMEOUT_MS = 12_000;
const CHAT_TIMEOUT_MS = 30_000;

export function loadLlmConfig(): LlmConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (v.mode === 'direct' && typeof v.apiKey === 'string' && v.apiKey) {
      return {
        mode: 'direct',
        apiKey: v.apiKey,
        ...(typeof v.judgeModel === 'string' && v.judgeModel ? { judgeModel: v.judgeModel } : {}),
        ...(typeof v.chatModel === 'string' && v.chatModel ? { chatModel: v.chatModel } : {}),
      };
    }
    // mode 가 없으면 이전 버전의 Worker 설정
    if ((v.mode === 'worker' || v.mode === undefined) && typeof v.endpoint === 'string' && typeof v.accessKey === 'string') {
      if (v.endpoint && v.accessKey) return { mode: 'worker', endpoint: v.endpoint, accessKey: v.accessKey };
    }
    return null;
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

// 직접 호출 모드의 하루 호출 수 (서울 날짜, 이 기기 기준). 실수로 많이 부르는 것을 막는 안전장치.
function consumeDirectQuota(): void {
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  let usage = { date: today, count: 0 };
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { date?: string; count?: number };
      if (v.date === today && typeof v.count === 'number') usage = { date: today, count: v.count };
    }
  } catch {
    // 기록을 못 읽으면 0 부터
  }
  if (usage.count >= DIRECT_DAILY_LIMIT) throw new LlmError('오늘 AI 호출 한도를 다 썼어요.');
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ ...usage, count: usage.count + 1 }));
  } catch {
    // 저장 실패는 무시
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LlmError('AI 응답이 늦어 건너뛰었어요.')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function workerCall<T>(
  config: Extract<LlmConfig, { mode: 'worker' }>,
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
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

async function directError(e: unknown): Promise<LlmError> {
  if (e instanceof LlmError) return e;
  const { describeDirectError } = await import('./claudeDirect');
  return new LlmError(await describeDirectError(e));
}

export async function checkConnection(config: LlmConfig): Promise<void> {
  if (config.mode === 'worker') {
    await workerCall(config, '/health', { method: 'GET' }, JUDGE_TIMEOUT_MS);
    return;
  }
  try {
    const { checkDirectKey } = await import('./claudeDirect');
    await withTimeout(checkDirectKey(config), JUDGE_TIMEOUT_MS);
  } catch (e) {
    throw await directError(e);
  }
}

// 실패하면 null (로컬 판정으로 진행).
export async function judgeAnswer(card: StudyCard, input: string): Promise<JudgeVerdict | null> {
  const config = loadLlmConfig();
  if (!config || !isLlmEnabled()) return null;
  const body = { target: { ja: card.ja, readings: card.readings, ko: card.ko, situation: card.situation }, input };
  try {
    if (config.mode === 'worker') {
      const result = await workerCall<unknown>(config, '/judge', { method: 'POST', body: JSON.stringify(body) }, JUDGE_TIMEOUT_MS);
      return isJudgeVerdict(result) ? result : null;
    }
    consumeDirectQuota();
    const { callModelDirect } = await import('./claudeDirect');
    const req = parseJudgeRequest(body);
    const result = await withTimeout(callModelDirect(config, buildJudgeCall(req)), JUDGE_TIMEOUT_MS);
    const verdict = parseJudgeResponse(resultText(result));
    return isJudgeVerdict(verdict) ? verdict : null;
  } catch {
    return null;
  }
}

export interface ChatLine {
  role: 'staff' | 'learner';
  text: string;
}

export type ChatTurnResult = ChatResponse;

export async function chatTurn(
  theme: Theme,
  phrases: Pick<StudyCard, 'id' | 'ja' | 'ko'>[],
  history: ChatLine[],
): Promise<ChatTurnResult> {
  const config = loadLlmConfig();
  if (!config) throw new LlmError('설정에서 AI 를 먼저 연결해 주세요.');
  const body = { theme, phrases: phrases.map(({ id, ja, ko }) => ({ id, ja, ko })), history };
  if (config.mode === 'worker') {
    return workerCall<ChatTurnResult>(config, '/chat', { method: 'POST', body: JSON.stringify(body) }, CHAT_TIMEOUT_MS);
  }
  try {
    consumeDirectQuota();
    const { callModelDirect } = await import('./claudeDirect');
    const req = parseChatRequest(body);
    const result = await withTimeout(callModelDirect(config, buildChatCall(req)), CHAT_TIMEOUT_MS);
    return parseChatResponse(resultText(result), req);
  } catch (e) {
    throw await directError(e);
  }
}
