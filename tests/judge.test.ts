import { describe, expect, it } from 'vitest';
import { combineGrade, isJudgeVerdict, needsJudge, type JudgeVerdict } from '../src/core/judge';

const v = (match: JudgeVerdict['match']): JudgeVerdict => ({ match, feedback: '', corrected: null });
const correct = { result: 'correct', rating: 'good' } as const;
const near = { result: 'near', rating: 'hard' } as const;
const wrong = { result: 'wrong', rating: 'again' } as const;

describe('combineGrade', () => {
  it('로컬 정답이면 LLM 을 부르지 않고 그대로', () => {
    expect(needsJudge(correct)).toBe(false);
    expect(combineGrade(correct, v('wrong'), false)).toMatchObject(correct);
  });

  it('표기만 다른 같은 문장(exact)은 good, 힌트를 썼으면 hard', () => {
    expect(combineGrade(wrong, v('exact'), false)).toMatchObject({ result: 'correct', rating: 'good' });
    expect(combineGrade(wrong, v('exact'), true)).toMatchObject({ result: 'correct', rating: 'hard' });
  });

  it('뜻이 같은 다른 표현(equivalent)은 hard', () => {
    expect(combineGrade(wrong, v('equivalent'), false)).toMatchObject({ result: 'equivalent', rating: 'hard' });
  });

  it('LLM 이 wrong 이면 로컬 판정 유지 (근접 오답은 hard 로 남음)', () => {
    expect(combineGrade(near, v('wrong'), false)).toMatchObject(near);
    expect(combineGrade(wrong, v('wrong'), false)).toMatchObject(wrong);
  });

  it('LLM 을 못 쓰면 로컬 판정 그대로', () => {
    expect(combineGrade(wrong, null, false)).toEqual({ ...wrong, verdict: null });
  });
});

describe('isJudgeVerdict', () => {
  it('형식 검사', () => {
    expect(isJudgeVerdict({ match: 'exact', feedback: 'ok', corrected: null })).toBe(true);
    expect(isJudgeVerdict({ match: 'maybe', feedback: '', corrected: null })).toBe(false);
    expect(isJudgeVerdict({ match: 'exact', feedback: 1, corrected: null })).toBe(false);
    expect(isJudgeVerdict(null)).toBe(false);
  });
});
