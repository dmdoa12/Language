import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { seoulDateKey } from '../src/core/date';
import {
  applyReview,
  createFsrsCard,
  getRetrievability,
  introduceCard,
  isDue,
  scheduleReview,
  selectDueCards,
  selectNewCards,
} from '../src/core/fsrs';
import type { StudyCard, Theme } from '../src/core/types';

const T0 = new Date('2026-10-12T00:00:00Z'); // 서울 09:00
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function makeCard(id: string, theme: Theme = 'konbini'): StudyCard {
  return {
    id,
    ja: 'はい。',
    readings: ['はい'],
    ko: '네.',
    situation: '',
    theme,
    grammarTags: [],
    source: 'deck',
    fsrs: createFsrsCard(T0),
    introducedAt: null,
  };
}

describe('seoulDateKey', () => {
  it('Asia/Seoul 기준 날짜를 돌려준다', () => {
    expect(seoulDateKey(new Date('2026-10-12T14:59:00Z'))).toBe('2026-10-12');
    expect(seoulDateKey(new Date('2026-10-12T15:00:00Z'))).toBe('2026-10-13');
  });
});

describe('scheduleReview', () => {
  it('등급을 ts-fsrs Rating 으로 매핑한다 (easy 미사용)', () => {
    const card = createFsrsCard(T0);
    expect(scheduleReview(card, 'again', T0).log.rating).toBe(Rating.Again);
    expect(scheduleReview(card, 'hard', T0).log.rating).toBe(Rating.Hard);
    expect(scheduleReview(card, 'good', T0).log.rating).toBe(Rating.Good);
  });

  it('퍼즈가 꺼져 있어 결정적이다', () => {
    const a = scheduleReview(createFsrsCard(T0), 'good', T0).card;
    const b = scheduleReview(createFsrsCard(T0), 'good', T0).card;
    expect(a).toEqual(b);
  });

  it('good 이 again 보다 다음 due 가 늦다', () => {
    const card = createFsrsCard(T0);
    const again = scheduleReview(card, 'again', T0).card.due.getTime();
    const good = scheduleReview(card, 'good', T0).card.due.getTime();
    expect(good).toBeGreaterThan(again);
  });

  it('원본 카드를 변경하지 않는다', () => {
    const card = createFsrsCard(T0);
    const snapshot = structuredClone(card);
    scheduleReview(card, 'good', T0);
    expect(card).toEqual(snapshot);
  });
});

describe('getRetrievability', () => {
  it('New 카드는 0, 복습 직후는 높고 시간이 지나면 떨어진다', () => {
    const fresh = createFsrsCard(T0);
    expect(getRetrievability(fresh, T0)).toBe(0);
    let card = fresh;
    for (let i = 0; i < 3; i++) card = scheduleReview(card, 'good', card.due).card;
    const at = card.last_review!;
    const soon = getRetrievability(card, new Date(at.getTime() + DAY));
    const later = getRetrievability(card, new Date(at.getTime() + 60 * DAY));
    expect(soon).toBeGreaterThan(later);
  });
});

describe('isDue / selectDueCards', () => {
  it('도입되지 않은 카드는 due 가 아니다', () => {
    expect(isDue(makeCard('a'), T0)).toBe(false);
  });

  it('도입 직후 카드는 due', () => {
    expect(isDue(introduceCard(makeCard('a'), T0), T0)).toBe(true);
  });

  it('학습 단계 카드는 20분 안에 due 면 미리 출제, Review 상태는 아니다', () => {
    const learning = applyReview(introduceCard(makeCard('a'), T0), 'again', T0).card;
    expect(learning.fsrs.state).toBe(State.Learning);
    expect(learning.fsrs.due.getTime()).toBeGreaterThan(T0.getTime());
    expect(isDue(learning, T0)).toBe(true);

    let review = introduceCard(makeCard('b'), T0);
    while (review.fsrs.state !== State.Review) {
      review = applyReview(review, 'good', review.fsrs.due).card;
    }
    const justBefore = new Date(review.fsrs.due.getTime() - 10 * MIN);
    expect(isDue(review, justBefore)).toBe(false);
    expect(isDue(review, review.fsrs.due)).toBe(true);
  });

  it('retrievability 오름차순으로 정렬한다', () => {
    const graduate = (id: string, goods: number) => {
      let c = introduceCard(makeCard(id), T0);
      for (let i = 0; i < goods; i++) c = applyReview(c, 'good', c.fsrs.due).card;
      return c;
    };
    const weak = graduate('weak', 2);
    const strong = graduate('strong', 5);
    const now = new Date(Math.max(weak.fsrs.due.getTime(), strong.fsrs.due.getTime()));
    const order = selectDueCards([strong, weak, makeCard('new')], now).map((c) => c.id);
    expect(order).toEqual(['weak', 'strong']);
  });
});

describe('selectNewCards', () => {
  it('해금 테마의 안 배운 카드만, 오늘 남은 한도만큼 덱 순서대로', () => {
    const cards = [
      introduceCard(makeCard('done'), T0),
      makeCard('n1'),
      makeCard('cafe1', 'cafe'),
      makeCard('n2'),
      makeCard('n3'),
    ];
    expect(selectNewCards(cards, ['konbini'], 3, T0).map((c) => c.id)).toEqual(['n1', 'n2']);
    expect(selectNewCards(cards, ['konbini', 'cafe'], 10, T0).map((c) => c.id)).toEqual([
      'n1',
      'cafe1',
      'n2',
      'n3',
    ]);
  });

  it('어제 도입한 카드는 오늘 한도에 포함하지 않는다', () => {
    const yesterday = new Date(T0.getTime() - DAY);
    const cards = [introduceCard(makeCard('old'), yesterday), makeCard('n1')];
    expect(selectNewCards(cards, ['konbini'], 1, T0).map((c) => c.id)).toEqual(['n1']);
  });
});

describe('introduceCard', () => {
  it('introducedAt 을 설정하고 원본은 그대로 둔다', () => {
    const card = makeCard('a');
    const later = new Date(T0.getTime() + DAY);
    const introduced = introduceCard(card, later);
    expect(introduced.introducedAt).toBe(later.getTime());
    expect(introduced.fsrs.due.getTime()).toBe(later.getTime());
    expect(card.introducedAt).toBeNull();
  });
});
