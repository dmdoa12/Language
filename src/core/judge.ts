import type { AnswerGrade } from './answer';

// LLM 판정 (Worker /judge 응답).
// exact: 표준 문장과 같은 말 (한자·가나 표기, 구두점만 다름 — 음성 인식 결과 등)
// equivalent: 다른 표현이지만 그 상황에서 자연스럽고 뜻이 같음
// wrong: 그 외
export interface JudgeVerdict {
  match: 'exact' | 'equivalent' | 'wrong';
  feedback: string; //         한국어 짧은 첨삭
  corrected: string | null; // 사용자 답을 자연스럽게 고친 문장 (있으면)
}

export interface CombinedGrade extends AnswerGrade {
  verdict: JudgeVerdict | null;
}

// 로컬 판정이 정답이면 LLM 을 쓰지 않는다. 그 외에는 LLM 판정으로 올려줄 수만 있다 (내리지 않음).
export function needsJudge(local: AnswerGrade): boolean {
  return local.result !== 'correct';
}

export function combineGrade(local: AnswerGrade, verdict: JudgeVerdict | null, hintUsed: boolean): CombinedGrade {
  if (!verdict || local.result === 'correct') return { ...local, verdict };
  switch (verdict.match) {
    case 'exact':
      return { result: 'correct', rating: hintUsed ? 'hard' : 'good', verdict };
    case 'equivalent':
      return { result: 'equivalent', rating: 'hard', verdict };
    case 'wrong':
      return { ...local, verdict };
  }
}

export function isJudgeVerdict(value: unknown): value is JudgeVerdict {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.match === 'exact' || v.match === 'equivalent' || v.match === 'wrong') &&
    typeof v.feedback === 'string' &&
    (v.corrected === null || typeof v.corrected === 'string')
  );
}
