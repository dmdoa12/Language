import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CHAT_MODEL, DEFAULT_JUDGE_MODEL } from '../../src/core/llmPrompts';
import { createWorker, type Env, type ModelCall, type ModelResult } from './handler';

function firstText(content: Array<{ type: string }>): string | null {
  for (const block of content) {
    if (block.type === 'text') return (block as Anthropic.TextBlock).text;
  }
  return null;
}

async function callModel(env: Env, call: ModelCall): Promise<ModelResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 25_000 });
  if (call.kind === 'judge') {
    // 채점·첨삭: 빠르고 저렴한 모델, 낮은 effort
    const response = await client.messages.create({
      model: env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL,
      max_tokens: 2048,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: call.schema } },
      system: call.system,
      messages: [{ role: 'user', content: call.user }],
    });
    return { stopReason: response.stop_reason, text: firstText(response.content) };
  }
  // 보스 대화: 상위 모델 + 거절 시 서버 측 폴백
  const response = await client.beta.messages.create({
    model: env.CHAT_MODEL ?? DEFAULT_CHAT_MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: call.schema } },
    system: call.system,
    messages: [{ role: 'user', content: call.user }],
  });
  return { stopReason: response.stop_reason, text: firstText(response.content) };
}

const worker: ExportedHandler<Env> = createWorker({
  callModel,
  isRateLimit: (error) => error instanceof Anthropic.RateLimitError,
  isApiError: (error) => error instanceof Anthropic.APIError,
});

export default worker;
