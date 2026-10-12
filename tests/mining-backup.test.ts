import { describe, expect, it } from 'vitest';
import { gradeAnswer } from '../src/core/answer';
import { parseBackup, serializeBackup } from '../src/core/backup';
import { applyReview, createFsrsCard } from '../src/core/fsrs';
import { buildMinedCard, createMinedPhrase, parseList, validateMinedInput } from '../src/core/mining';
import { DEFAULT_PROFILE, type ReviewLogEntry } from '../src/core/types';

const NOW = new Date('2026-10-12T00:00:00Z');

describe('mining', () => {
  const phrase = createMinedPhrase('p1', ' 생각보다 별로였어 ', '', ' 친구랑 영화 보고 ', 1);
  const input = {
    ja: '思ったよりイマイチだった。',
    readingsText: 'おもったよりいまいちだった\nオモッタヨリイマイチダッタ',
    situation: '친구와 본 영화가 기대 이하였다.',
    theme: 'smalltalk' as const,
    grammarTagsText: '〜より, 〜た',
  };

  it('createMinedPhrase 는 공백을 정리하고 빈 ja 는 null', () => {
    expect(phrase).toEqual({ id: 'p1', ko: '생각보다 별로였어', ja: null, note: '친구랑 영화 보고', createdAt: 1, cardId: null });
  });

  it('parseList 는 줄바꿈·쉼표·、 로 나눈다', () => {
    expect(parseList('a\nb, c、d\n\n')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('검증: 필수 항목과 히라가나 읽기', () => {
    expect(validateMinedInput(input)).toEqual([]);
    const bad = validateMinedInput({ ...input, ja: ' ', situation: '', readingsText: '思ったより' });
    expect(bad).toHaveLength(3);
    expect(validateMinedInput({ ...input, readingsText: '' })).toHaveLength(1);
  });

  it('카드로 바꾸면 mined 출처로 바로 학습 시작, 읽기는 정규화되어 채점된다', () => {
    const card = buildMinedCard(phrase, input, 'mined-1', NOW);
    expect(card).toMatchObject({
      id: 'mined-1',
      ko: '생각보다 별로였어',
      source: 'mined',
      theme: 'smalltalk',
      introducedAt: NOW.getTime(),
      grammarTags: ['〜より', '〜た'],
      readings: ['おもったよりいまいちだった', 'おもったよりいまいちだった'],
    });
    expect(gradeAnswer(card, 'omottayoriimaichidatta', false).rating).toBe('good');
  });
});

describe('backup', () => {
  it('내보내기 → 가져오기 시 Date 필드를 되살린다', () => {
    const fresh = {
      id: 'c1',
      ja: 'はい。',
      readings: ['はい'],
      ko: '네',
      situation: '',
      theme: 'konbini' as const,
      grammarTags: [],
      source: 'deck' as const,
      fsrs: createFsrsCard(NOW),
      introducedAt: NOW.getTime(),
    };
    const { card, log } = applyReview(fresh, 'good', NOW);
    const entry: ReviewLogEntry = {
      id: 'l1',
      cardId: 'c1',
      dayId: null,
      rating: 'good',
      input: 'はい',
      hintUsed: false,
      elapsedMs: 1000,
      answeredAt: NOW.getTime(),
      fsrsLog: log,
    };
    const text = serializeBackup({
      exportedAt: 5,
      cards: [card],
      reviewLogs: [entry],
      days: [],
      minedPhrases: [],
      profile: DEFAULT_PROFILE,
    });
    const parsed = parseBackup(text);
    expect(parsed.cards[0]!.fsrs.due).toBeInstanceOf(Date);
    expect(parsed.cards[0]!.fsrs.due.getTime()).toBe(card.fsrs.due.getTime());
    expect(parsed.cards[0]!.fsrs.last_review!.getTime()).toBe(card.fsrs.last_review!.getTime());
    expect(parsed.reviewLogs[0]!.fsrsLog.review).toBeInstanceOf(Date);
    expect(parsed.profile).toEqual(DEFAULT_PROFILE);
  });

  it('잘못된 파일은 이유를 담아 거부한다', () => {
    expect(() => parseBackup('nope')).toThrow('JSON');
    expect(() => parseBackup('{"version":99}')).toThrow('버전');
    expect(() => parseBackup('{"version":1,"profile":{}}')).toThrow('이전 버전');
    expect(() => parseBackup('{"version":2,"profile":{}}')).toThrow('cards');
  });
});
