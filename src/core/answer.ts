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

const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

// 0 ~ 9999 를 한자 숫자로 (十·百·千 앞의 一은 생략).
function underTenThousand(n: number): string {
  let out = '';
  for (const [unit, label] of [
    [1000, '千'],
    [100, '百'],
    [10, '十'],
  ] as const) {
    const d = Math.floor(n / unit) % 10;
    if (d > 0) out += (d === 1 ? '' : DIGITS[d]) + label;
  }
  const ones = n % 10;
  if (ones > 0) out += DIGITS[ones];
  return out;
}

// 아라비아 숫자 → 한자 숫자 (1枚 → 一枚, 1000円 → 千円). 1억 이상은 그대로 둔다.
export function arabicToKanji(n: number): string {
  if (n === 0) return DIGITS[0]!;
  if (!Number.isInteger(n) || n < 0 || n >= 100_000_000) return String(n);
  const man = Math.floor(n / 10_000);
  const rest = n % 10_000;
  return (man > 0 ? underTenThousand(man) + '万' : '') + underTenThousand(rest);
}

// 공백, 구두점(\p{P}), 기호(\p{S}). ー는 \p{Lm} 이라 제거되지 않는다.
const STRIP_PATTERN = /[\s\p{P}\p{S}]/gu;

export function normalizeAnswer(input: string): string {
  const nfkc = input.normalize('NFKC').toLowerCase();
  const numerals = nfkc.replace(/\d+/g, (d) => arabicToKanji(Number(d)));
  const kana = toHiragana(katakanaToHiragana(numerals));
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

const HIRAGANA = /^[\u3041-\u3096ー]$/u;

// 한자·가나 혼용 일치: 표준 문장(ja)의 각 한자를 그대로 쓰거나 읽기의 해당 가나로 바꿔 쓴 답인가.
// ja 와 reading 을 맞춰 가며 한자 한 글자가 읽기의 가나 1자 이상에 대응하도록 정렬한다.
// 남는 한자는 ja 와 같아야 하고 가나는 reading 과 같아야 하므로, 같은 문장의 표기 차이만 인정된다.
export function matchesMixed(input: string, ja: string, reading: string): boolean {
  const I = Array.from(input);
  const J = Array.from(ja);
  const R = Array.from(reading);
  const memo = new Map<number, boolean>();
  const key = (i: number, j: number, r: number) => (i * (J.length + 1) + j) * (R.length + 1) + r;

  const go = (i: number, j: number, r: number): boolean => {
    if (j === J.length) return i === I.length && r === R.length;
    const k = key(i, j, r);
    const cached = memo.get(k);
    if (cached !== undefined) return cached;
    let ok = false;
    const c = J[j]!;
    if (HIRAGANA.test(c)) {
      ok = I[i] === c && R[r] === c && go(i + 1, j + 1, r + 1);
    } else {
      // 한자 한 글자가 읽기의 R[r..r+len) 에 대응
      for (let len = 1; !ok && r + len <= R.length; len++) {
        if (I[i] === c && go(i + 1, j + 1, r + len)) ok = true;
        else if (i + len <= I.length && I.slice(i, i + len).join('') === R.slice(r, r + len).join('')) {
          ok = go(i + len, j + 1, r + len);
        }
      }
    }
    memo.set(k, ok);
    return ok;
  };
  return go(0, 0, 0);
}

export function isExactAnswer(target: AnswerTarget, input: string): boolean {
  const normalized = normalizeAnswer(input);
  if (normalized.length === 0) return false;
  if (normalizedTargets(target).includes(normalized)) return true;
  const ja = normalizeAnswer(target.ja);
  return target.readings.some((r) => matchesMixed(normalized, ja, normalizeAnswer(r)));
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
