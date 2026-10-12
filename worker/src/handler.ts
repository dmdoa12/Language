import {
  allowedOrigin,
  buildChatCall,
  buildJudgeCall,
  checkAccess,
  parseChatRequest,
  parseChatResponse,
  parseJudgeRequest,
  parseJudgeResponse,
  resultText,
  usageKey,
  type ModelCall,
  type ModelResult,
} from './logic';

export type { ModelCall, ModelResult };

// Cloudflare KVNamespace 중 쓰는 부분만 (앱 쪽 타입 체크에서도 쓰려고 직접 정의).
export interface UsageStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  ANTHROPIC_API_KEY: string; // wrangler secret
  ACCESS_KEY: string; //        wrangler secret
  ALLOWED_ORIGINS?: string;
  DAILY_LIMIT?: string;
  JUDGE_MODEL?: string;
  CHAT_MODEL?: string;
  USAGE?: UsageStore; //       선택. 있으면 하루 호출 상한을 센다
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    },
  });
}

async function consumeQuota(env: Env): Promise<{ ok: boolean; remaining: number | null }> {
  if (!env.USAGE) return { ok: true, remaining: null };
  const limit = Number(env.DAILY_LIMIT ?? '300');
  const key = usageKey(new Date());
  const used = Number((await env.USAGE.get(key)) ?? '0');
  if (used >= limit) return { ok: false, remaining: 0 };
  // KV 는 원자적이지 않지만 혼자 쓰는 앱이라 근사치로 충분하다.
  await env.USAGE.put(key, String(used + 1), { expirationTtl: 2 * 24 * 60 * 60 });
  return { ok: true, remaining: limit - used - 1 };
}

export interface WorkerDeps {
  // Claude 호출 (SDK 는 index.ts 에만 있다)
  callModel: (env: Env, call: ModelCall) => Promise<ModelResult>;
  isRateLimit: (error: unknown) => boolean;
  isApiError: (error: unknown) => boolean;
}

async function judge(deps: WorkerDeps, env: Env, body: unknown) {
  const req = parseJudgeRequest(body);
  return parseJudgeResponse(resultText(await deps.callModel(env, buildJudgeCall(req))));
}

async function chat(deps: WorkerDeps, env: Env, body: unknown) {
  const req = parseChatRequest(body);
  return parseChatResponse(resultText(await deps.callModel(env, buildChatCall(req))), req);
}

export function createWorker(deps: WorkerDeps) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const origin = request.headers.get('Origin');
      const corsOrigin = allowedOrigin(origin, env);

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: corsOrigin ? 204 : 403,
          headers: corsOrigin
            ? {
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Access-Key',
                'Access-Control-Max-Age': '86400',
                Vary: 'Origin',
              }
            : {},
        });
      }

      const access = checkAccess(origin, request.headers.get('X-Access-Key'), env);
      if (!access.ok) return json({ error: access.error }, access.status, corsOrigin);

      const path = new URL(request.url).pathname;
      if (request.method === 'GET' && path === '/health') return json({ ok: true }, 200, corsOrigin);
      if (request.method !== 'POST' || (path !== '/judge' && path !== '/chat')) {
        return json({ error: '없는 경로예요.' }, 404, corsOrigin);
      }

      const quota = await consumeQuota(env);
      if (!quota.ok) return json({ error: '오늘 AI 호출 한도를 다 썼어요.' }, 429, corsOrigin);

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'JSON 본문이 필요해요.' }, 400, corsOrigin);
      }

        try {
        const result = path === '/judge' ? await judge(deps, env, body) : await chat(deps, env, body);
        return json(result, 200, corsOrigin);
      } catch (error) {
        if (deps.isRateLimit(error)) return json({ error: 'AI 가 잠시 바빠요.' }, 503, corsOrigin);
        if (deps.isApiError(error)) {
          console.error('anthropic', error);
          return json({ error: 'AI 호출에 실패했어요.' }, 502, corsOrigin);
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error('worker', message);
        return json({ error: message }, 400, corsOrigin);
      }
    },
  };
}
