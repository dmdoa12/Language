// Worker 전용 순수 로직: 접근 확인, 하루 사용량 키.
// 프롬프트·스키마·검증은 앱과 함께 쓰는 src/core/llmPrompts.ts 에 있다.

export * from '../../src/core/llmPrompts';

export interface AccessEnv {
  ACCESS_KEY?: string;
  ALLOWED_ORIGINS?: string; // 쉼표 구분. 비우면 출처 확인 안 함
}

export type AccessResult = { ok: true } | { ok: false; status: 401 | 403 | 500; error: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function allowedOrigin(origin: string | null, env: AccessEnv): string | null {
  const list = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return origin ?? '*';
  return origin !== null && list.includes(origin) ? origin : null;
}

export function checkAccess(origin: string | null, accessKey: string | null, env: AccessEnv): AccessResult {
  if (!env.ACCESS_KEY) return { ok: false, status: 500, error: 'ACCESS_KEY 가 설정되지 않았어요.' };
  if (allowedOrigin(origin, env) === null) return { ok: false, status: 403, error: '허용되지 않은 출처예요.' };
  if (!accessKey || !timingSafeEqual(accessKey, env.ACCESS_KEY)) {
    return { ok: false, status: 401, error: '접속 암호가 맞지 않아요.' };
  }
  return { ok: true };
}

// 서울 날짜 기준 하루 사용량 키.
export function usageKey(now: Date): string {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `usage:${seoul.toISOString().slice(0, 10)}`;
}

