import { normalizeAnswer } from './answer';
import { createFsrsCard } from './fsrs';
import type { MinedPhrase, StudyCard, Theme } from './types';

export interface MinedCardInput {
  ja: string;
  readingsText: string; // 줄바꿈 또는 쉼표로 여러 개
  situation: string;
  theme: Theme;
  grammarTagsText: string;
}

const HIRAGANA_ONLY = /^[ぁ-ゖー]+$/u;

export function parseList(text: string): string[] {
  return text
    .split(/[\n,、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function createMinedPhrase(id: string, ko: string, ja: string, note: string, now: number): MinedPhrase {
  return { id, ko: ko.trim(), ja: ja.trim() === '' ? null : ja.trim(), note: note.trim(), createdAt: now, cardId: null };
}

// 변환 입력 검증. 문제 없으면 빈 배열.
export function validateMinedInput(input: MinedCardInput): string[] {
  const errors: string[] = [];
  if (input.ja.trim() === '') errors.push('일본어 문장을 입력해 주세요.');
  if (input.situation.trim() === '') errors.push('상황 설명을 입력해 주세요.');
  const readings = parseList(input.readingsText);
  if (readings.length === 0) errors.push('읽기(히라가나)를 하나 이상 입력해 주세요.');
  for (const r of readings) {
    if (!HIRAGANA_ONLY.test(normalizeAnswer(r))) errors.push(`읽기는 히라가나로만 써 주세요: ${r}`);
  }
  return errors;
}

export function buildMinedCard(phrase: MinedPhrase, input: MinedCardInput, cardId: string, now: Date): StudyCard {
  return {
    id: cardId,
    ja: input.ja.trim(),
    readings: parseList(input.readingsText).map(normalizeAnswer),
    ko: phrase.ko,
    situation: input.situation.trim(),
    theme: input.theme,
    grammarTags: parseList(input.grammarTagsText),
    source: 'mined',
    fsrs: createFsrsCard(now),
    introducedAt: now.getTime(), // 직접 만든 표현은 상점을 거치지 않고 바로 학습 시작
  };
}
