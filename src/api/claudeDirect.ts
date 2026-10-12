// 브라우저에서 Claude API 직접 호출 (사용자가 설정에 넣은 본인 API 키, 이 기기에만 저장).
// SDK 는 AI 기능을 처음 쓸 때만 불러온다.
import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CHAT_MODEL, DEFAULT_JUDGE_MODEL, type ModelCall, type ModelResult } from '../core/llmPrompts';

export interface DirectConfig {
  apiKey: string;
  judgeModel?: string;
  chatModel?: string;
}

async function createClient(apiKey: string): Promise<Anthropic> {
  const { default: AnthropicClient } = await import('@anthropic-ai/sdk');
  return new AnthropicClient({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 25_000 });
}

function firstText(content: Array<{ type: string }>): string | null {
  for (const block of content) {
    if (block.type === 'text') return (block as Anthropic.TextBlock).text;
  }
  return null;
}

export async function callModelDirect(config: DirectConfig, call: ModelCall): Promise<ModelResult> {
  const client = await createClient(config.apiKey);
  if (call.kind === 'judge') {
    // 채점·첨삭: 빠르고 저렴한 모델, 낮은 effort
    const response = await client.messages.create({
      model: config.judgeModel ?? DEFAULT_JUDGE_MODEL,
      max_tokens: 2048,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: call.schema } },
      system: call.system,
      messages: [{ role: 'user', content: call.user }],
    });
    return { stopReason: response.stop_reason, text: firstText(response.content) };
  }
  // 보스 대화: 상위 모델 + 거절 시 서버 측 폴백
  const response = await client.beta.messages.create({
    model: config.chatModel ?? DEFAULT_CHAT_MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: call.schema } },
    system: call.system,
    messages: [{ role: 'user', content: call.user }],
  });
  return { stopReason: response.stop_reason, text: firstText(response.content) };
}

// 키 확인: 토큰을 쓰지 않는 모델 조회로 인증만 검사한다.
export async function checkDirectKey(config: DirectConfig): Promise<void> {
  const client = await createClient(config.apiKey);
  await client.models.retrieve(config.judgeModel ?? DEFAULT_JUDGE_MODEL);
}

export async function describeDirectError(error: unknown): Promise<string> {
  const { default: AnthropicClient } = await import('@anthropic-ai/sdk');
  if (error instanceof AnthropicClient.AuthenticationError) return 'API 키가 올바르지 않아요.';
  if (error instanceof AnthropicClient.PermissionDeniedError) return '이 키로는 해당 모델을 쓸 수 없어요.';
  if (error instanceof AnthropicClient.RateLimitError) return 'AI 가 잠시 바빠요. 조금 뒤에 다시 해 주세요.';
  if (error instanceof AnthropicClient.APIConnectionError) return 'Claude 서버에 연결하지 못했어요.';
  if (error instanceof AnthropicClient.APIError) return `AI 호출에 실패했어요 (${error.status ?? '알 수 없음'}).`;
  return error instanceof Error ? error.message : String(error);
}
