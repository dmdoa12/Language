import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorker } from '../worker/src/handler';
import {
  buildChatUserMessage,
  buildJudgeUserMessage,
  checkAccess,
  parseChatRequest,
  parseChatResponse,
  parseJudgeRequest,
  parseJudgeResponse,
  usageKey,
} from '../worker/src/logic';

const callModel = vi.fn();

class FakeApiError extends Error {}
class FakeRateLimitError extends FakeApiError {}

const worker = createWorker({
  callModel,
  isRateLimit: (e) => e instanceof FakeRateLimitError,
  isApiError: (e) => e instanceof FakeApiError,
});

const ORIGIN = 'https://dmdoa12.github.io';
const env = { ANTHROPIC_API_KEY: 'sk', ACCESS_KEY: 'secret', ALLOWED_ORIGINS: ORIGIN };
const judgeBody = {
  target: { ja: '袋は大丈夫です。', readings: ['ふくろはだいじょうぶです'], ko: '봉투는 괜찮아요.', situation: '점원이 봉투를 묻는다' },
  input: 'ふくろいらないです',
};

function req(path: string, init: { method?: string; key?: string | null; origin?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.key !== null) headers['X-Access-Key'] = init.key ?? 'secret';
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  return new Request(`https://w.example${path}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function modelResult(obj: unknown, stopReason = 'end_turn') {
  return { stopReason, text: JSON.stringify(obj) };
}

class FakeKV {
  store = new Map<string, string>();
  async get(k: string) {
    return this.store.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.store.set(k, v);
  }
}

beforeEach(() => {
  callModel.mockReset();
});

describe('worker logic', () => {
  it('접속 암호와 출처를 확인한다', () => {
    expect(checkAccess(ORIGIN, 'secret', env)).toEqual({ ok: true });
    expect(checkAccess(ORIGIN, 'nope', env)).toMatchObject({ ok: false, status: 401 });
    expect(checkAccess('https://evil.example', 'secret', env)).toMatchObject({ ok: false, status: 403 });
    expect(checkAccess(ORIGIN, 'secret', { ALLOWED_ORIGINS: ORIGIN })).toMatchObject({ ok: false, status: 500 });
    expect(checkAccess(null, 'secret', { ACCESS_KEY: 'secret' })).toEqual({ ok: true });
  });

  it('사용량 키는 서울 날짜', () => {
    expect(usageKey(new Date('2026-10-12T15:30:00Z'))).toBe('usage:2026-10-13');
  });

  it('판정 요청을 검증하고 학습자 답은 태그로 감싼다', () => {
    const r = parseJudgeRequest(judgeBody);
    expect(buildJudgeUserMessage(r)).toContain('<learner_answer>\nふくろいらないです\n</learner_answer>');
    expect(() => parseJudgeRequest({ target: {}, input: 'x' })).toThrow('target.ja');
    expect(() => parseJudgeRequest({ ...judgeBody, input: '  ' })).toThrow('input');
  });

  it('판정 응답 형식 검사', () => {
    expect(parseJudgeResponse('{"match":"equivalent","feedback":"f","corrected":null}').match).toBe('equivalent');
    expect(() => parseJudgeResponse('{"match":"maybe","feedback":"f","corrected":null}')).toThrow();
  });

  it('대화: 모르는 표현 id 는 버리고 학습자 4회면 done', () => {
    const r = parseChatRequest({
      theme: 'konbini',
      phrases: [{ id: 'k1', ja: '袋は大丈夫です。', ko: '봉투 괜찮아요' }],
      history: [
        { role: 'staff', text: 'いらっしゃいませ' },
        { role: 'learner', text: 'a' },
        { role: 'staff', text: 'b' },
        { role: 'learner', text: 'c' },
        { role: 'staff', text: 'd' },
        { role: 'learner', text: 'e' },
        { role: 'staff', text: 'f' },
        { role: 'learner', text: 'g' },
      ],
    });
    const out = parseChatResponse(
      JSON.stringify({ reply: 'r', replyKo: 'k', usedPhraseIds: ['k1', 'zz', 'k1'], correction: null, done: false }),
      r,
    );
    expect(out.usedPhraseIds).toEqual(['k1']);
    expect(out.done).toBe(true);
    expect(buildChatUserMessage(r)).toContain('<learner>g</learner>');
    expect(buildChatUserMessage({ ...r, history: [] })).toContain('Open the conversation');
    expect(() => parseChatRequest({ theme: 'konbini', phrases: [], history: [{ role: 'system', text: 'x' }] })).toThrow();
  });
});

describe('worker fetch', () => {
  it('OPTIONS 는 허용 출처에만 CORS 허용', async () => {
    const ok = await worker.fetch(req('/judge', { method: 'OPTIONS' }), env);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const bad = await worker.fetch(req('/judge', { method: 'OPTIONS', origin: 'https://evil.example' }), env);
    expect(bad.status).toBe(403);
  });

  it('암호가 틀리면 401 이고 Claude 를 부르지 않는다', async () => {
    const res = await worker.fetch(req('/judge', { key: 'wrong', body: judgeBody }), env);
    expect(res.status).toBe(401);
    expect(callModel).not.toHaveBeenCalled();
  });

  it('/health', async () => {
    const res = await worker.fetch(req('/health', { method: 'GET' }), env);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('/judge 는 판정 프롬프트·스키마로 호출하고 결과를 돌려준다', async () => {
    callModel.mockResolvedValue(modelResult({ match: 'equivalent', feedback: '뜻은 같아요', corrected: null }));
    const res = await worker.fetch(req('/judge', { body: judgeBody }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ match: 'equivalent', feedback: '뜻은 같아요', corrected: null });
    const call = callModel.mock.calls[0]![1];
    expect(call.kind).toBe('judge');
    expect(call.user).toContain('ふくろいらないです');
    expect(call.schema.required).toEqual(['match', 'feedback', 'corrected']);
  });

  it('/chat 은 대화 프롬프트로 호출한다', async () => {
    callModel.mockResolvedValue(
      modelResult({ reply: 'いらっしゃいませ', replyKo: '어서 오세요', usedPhraseIds: [], correction: null, done: false }),
    );
    const res = await worker.fetch(
      req('/chat', { body: { theme: 'konbini', phrases: [{ id: 'k1', ja: '袋は大丈夫です', ko: 'b' }], history: [] } }),
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe('いらっしゃいませ');
    const call = callModel.mock.calls[0]![1];
    expect(call.kind).toBe('chat');
    expect(call.system).toContain('convenience store');
    expect(call.system).toContain('[k1] 袋は大丈夫です');
  });

  it('응답 JSON 이 깨졌으면 400', async () => {
    callModel.mockResolvedValue({ stopReason: 'end_turn', text: '{oops' });
    expect((await worker.fetch(req('/judge', { body: judgeBody }), env)).status).toBe(400);
  });

  it('Claude API 오류는 502, 속도 제한은 503', async () => {
    callModel.mockRejectedValueOnce(new FakeApiError('boom'));
    expect((await worker.fetch(req('/judge', { body: judgeBody }), env)).status).toBe(502);
    callModel.mockRejectedValueOnce(new FakeRateLimitError('slow'));
    expect((await worker.fetch(req('/judge', { body: judgeBody }), env)).status).toBe(503);
  });

  it('거절 응답이면 오류로 처리한다', async () => {
    callModel.mockResolvedValue(modelResult({}, 'refusal'));
    const res = await worker.fetch(req('/judge', { body: judgeBody }), env);
    expect(res.status).toBe(400);
  });

  it('하루 상한을 넘으면 429', async () => {
    callModel.mockResolvedValue(modelResult({ match: 'exact', feedback: '', corrected: null }));
    const kv = new FakeKV();
    const limited = { ...env, DAILY_LIMIT: '2', USAGE: kv };
    expect((await worker.fetch(req('/judge', { body: judgeBody }), limited)).status).toBe(200);
    expect((await worker.fetch(req('/judge', { body: judgeBody }), limited)).status).toBe(200);
    expect((await worker.fetch(req('/judge', { body: judgeBody }), limited)).status).toBe(429);
    expect(callModel).toHaveBeenCalledTimes(2);
  });
});
