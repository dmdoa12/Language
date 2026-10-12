import { toHiragana } from 'wanakana';
import type { StudyCard, StudyRating } from './types';

export type AnswerTarget = Pick<StudyCard, 'ja' | 'readings'>;

// equivalent: LLM 이 뜻은 같다고 판정한 다른 표현 (core/judge.ts)
export type AnswerResult = 'correct' | 'near' | 'equivalent' | 'wrong';

export interface AnswerGrade {
  result: AnswerResult;
  rating: StudyRating;
}

const NEAR_MISS_MIN_LENGTH = 8;

// 가타카나(ァ-ヶ) → 히라가나. 장음 ー(U+30FC)는 범위 밖이라 그대로 남는다.
// wanakana.toHiragana 는 가타카나 장음을 모음으로 바꿔버리므로 직접 변환한다.
function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// 공백, 구두점(\p{P}), 기호(\p{S}). ー는 \p{Lm} 이라 제거되지 않는다.
const STRIP_PATTERN = /[\s\p{P}\p{S}]/gu;

export function normalizeAnswer(input: string): string {
  const nfkc = input.normalize('NFKC').toLowerCase();
  const kana = toHiragana(katakanaToHiragana(nfkc));
  return kana.replace(STRIP_PATTERN, '');
}

export function editDistance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[y.length]!;
}

function normalizedTargets(target: AnswerTarget): string[] {
  return [target.ja, ...target.readings].map(normalizeAnswer).filter((t) => t.length > 0);
}

export function isExactAnswer(target: AnswerTarget, input: string): boolean {
  const normalized = normalizeAnswer(input);
  if (normalized.length === 0) return false;
  return normalizedTargets(target).includes(normalized);
}

function isNearMiss(target: AnswerTarget, input: string): boolean {
  const normalized = normalizeAnswer(input);
  if (normalized.length === 0) return false;
  return normalizedTargets(target).some(
    (t) => Array.from(t).length >= NEAR_MISS_MIN_LENGTH && editDistance(t, normalized) === 1,
  );
}

export function gradeAnswer(target: AnswerTarget, input: string, hintUsed: boolean): AnswerGrade {
  if (isExactAnswer(target, input)) {
    return { result: 'correct', rating: hintUsed ? 'hard' : 'good' };
  }
  if (isNearMiss(target, input)) {
    return { result: 'near', rating: 'hard' };
  }
  return { result: 'wrong', rating: 'again' };
}
