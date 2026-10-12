import { beforeEach, describe, expect, it, vi } from 'vitest';

const callModelDirect = vi.fn();
const checkDirectKey = vi.fn();

vi.mock('../src/api/claudeDirect', () => ({
  callModelDirect,
  checkDirectKey,
  describeDirectError: async (e: unknown) => `wrapped: ${e instanceof Error ? e.message : String(e)}`,
}));

const llm = await import('../src/api/llm');

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const card = {
  id: 'k1',
  ja: 'レジ袋、一枚お願いします。',
  readings: ['れじぶくろいちまいおねがいします'],
  ko: '비닐봉투 한 장 주세요.',
  situation: '계산할 때',
  theme: 'konbini' as const,
  grammarTags: [],
  source: 'deck' as const,
  fsrs: {} as never,
  introducedAt: 1,
};

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  callModelDirect.mockReset();
  checkDirectKey.mockReset();
});

describe('설정 저장', () => {
  it('직접 호출 설정을 저장·불러온다', () => {
    llm.saveLlmConfig({ mode: 'direct', apiKey: 'sk-ant-x' });
    expect(llm.loadLlmConfig()).toEqual({ mode: 'direct', apiKey: 'sk-ant-x' });
    expect(llm.isLlmEnabled()).toBe(true);
    llm.saveLlmConfig(null);
    expect(llm.loadLlmConfig()).toBeNull();
  });

  it('mode 가 없는 이전 Worker 설정도 읽는다', () => {
    localStorage.setItem('jp-talk-llm', JSON.stringify({ endpoint: 'https://w', accessKey: 'k' }));
    expect(llm.loadLlmConfig()).toEqual({ mode: 'worker', endpoint: 'https://w', accessKey: 'k' });
  });
});

describe('직접 호출', () => {
  beforeEach(() => llm.saveLlmConfig({ mode: 'direct', apiKey: 'sk-ant-x' }));

  it('판정 프롬프트로 호출하고 결과를 검증해 돌려준다', async () => {
    callModelDirect.mockResolvedValue({
      stopReason: 'end_turn',
      text: JSON.stringify({ match: 'exact', feedback: '맞아요', corrected: null }),
    });
    expect(await llm.judgeAnswer(card, 'レジ袋いち枚おねがいします')).toEqual({ match: 'exact', feedback: '맞아요', corrected: null });
    const [config, call] = callModelDirect.mock.calls[0]!;
    expect(config.apiKey).toBe('sk-ant-x');
    expect(call.kind).toBe('judge');
    expect(call.user).toContain('<learner_answer>');
  });

  it('실패·거절·깨진 응답이면 null (로컬 판정으로 진행)', async () => {
    callModelDirect.mockRejectedValueOnce(new Error('network'));
    expect(await llm.judgeAnswer(card, 'x')).toBeNull();
    callModelDirect.mockResolvedValueOnce({ stopReason: 'refusal', text: null });
    expect(await llm.judgeAnswer(card, 'x')).toBeNull();
    callModelDirect.mockResolvedValueOnce({ stopReason: 'end_turn', text: '{bad' });
    expect(await llm.judgeAnswer(card, 'x')).toBeNull();
  });

  it('하루 호출 한도를 넘으면 더 부르지 않는다', async () => {
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    localStorage.setItem('jp-talk-llm-usage', JSON.stringify({ date: today, count: llm.DIRECT_DAILY_LIMIT }));
    expect(await llm.judgeAnswer(card, 'x')).toBeNull();
    expect(callModelDirect).not.toHaveBeenCalled();
  });

  it('대화: 모르는 표현 id 는 버린다', async () => {
    callModelDirect.mockResolvedValue({
      stopReason: 'end_turn',
      text: JSON.stringify({ reply: 'はい', replyKo: '네', usedPhraseIds: ['k1', 'zz'], correction: null, done: false }),
    });
    const out = await llm.chatTurn('konbini', [card], [{ role: 'staff', text: 'いらっしゃいませ' }, { role: 'learner', text: 'はい' }]);
    expect(out.usedPhraseIds).toEqual(['k1']);
    expect(callModelDirect.mock.calls[0]![1].kind).toBe('chat');
  });

  it('대화 실패는 이유를 담은 오류로', async () => {
    callModelDirect.mockRejectedValue(new Error('401'));
    await expect(llm.chatTurn('konbini', [card], [])).rejects.toThrow('wrapped: 401');
  });

  it('연결 확인은 키 검사를 부른다', async () => {
    checkDirectKey.mockResolvedValue(undefined);
    await llm.checkConnection({ mode: 'direct', apiKey: 'sk-ant-x' });
    expect(checkDirectKey).toHaveBeenCalled();
    checkDirectKey.mockRejectedValue(new Error('bad key'));
    await expect(llm.checkConnection({ mode: 'direct', apiKey: 'sk-ant-y' })).rejects.toThrow('wrapped: bad key');
  });
});
