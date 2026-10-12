import { describe, expect, it } from 'vitest';
import { gradeAnswer, normalizeAnswer } from '../src/core/answer';
import { buildDeckCards, SEED_DECKS } from '../src/data/seed';

const konbini = SEED_DECKS.konbini ?? [];
const HIRAGANA_ONLY = /^[ぁ-ゖー]+$/u;
const KANJI_RUN = /[一-鿿々]+/gu;

describe('konbini 시드 덱', () => {
  it('50장이고 id 가 중복되지 않는다', () => {
    expect(konbini).toHaveLength(50);
    expect(new Set(konbini.map((c) => c.id)).size).toBe(50);
  });

  it('필수 필드가 비어 있지 않다', () => {
    for (const c of konbini) {
      expect(c.ja.trim(), c.id).not.toBe('');
      expect(c.ko.trim(), c.id).not.toBe('');
      expect(c.situation.trim(), c.id).not.toBe('');
      expect(c.readings.length, c.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('readings 는 정규화 후 히라가나(+ー)만 남는다', () => {
    for (const c of konbini) {
      for (const r of c.readings) {
        expect(normalizeAnswer(r), `${c.id}: ${r}`).toMatch(HIRAGANA_ONLY);
      }
    }
  });

  it('ja 의 가나 부분이 각 reading 에 순서대로 들어 있다 (오타 검출)', () => {
    for (const c of konbini) {
      const pattern = normalizeAnswer(c.ja)
        .split(KANJI_RUN)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.+');
      // 축약형(〜てる)의 풀어쓴 표기는 ja 와 가나가 다르므로 첫 reading 만 강하게 검사.
      expect(normalizeAnswer(c.readings[0]!), c.id).toMatch(new RegExp(`^${pattern}$`, 'u'));
    }
  });

  it('모든 reading 과 ja 원문이 good 으로 판정된다', () => {
    for (const c of konbini) {
      expect(gradeAnswer(c, c.ja, false).rating, c.id).toBe('good');
      for (const r of c.readings) expect(gradeAnswer(c, r, false).rating, c.id).toBe('good');
    }
  });

  it('서로 다른 카드의 정답이 겹치지 않는다', () => {
    const seen = new Map<string, string>();
    for (const c of konbini) {
      for (const r of c.readings.map(normalizeAnswer)) {
        expect(seen.get(r), `${c.id} vs ${seen.get(r)}`).toBeUndefined();
        seen.set(r, c.id);
      }
    }
  });
});

describe('buildDeckCards', () => {
  it('아직 안 배운 deck 카드로 만든다', () => {
    const now = new Date('2026-10-12T00:00:00Z');
    const cards = buildDeckCards(now);
    expect(cards).toHaveLength(50);
    for (const c of cards) {
      expect(c.theme).toBe('konbini');
      expect(c.source).toBe('deck');
      expect(c.introducedAt).toBeNull();
    }
  });
});
