import { describe, expect, it } from 'vitest';
import {
  abandonRun,
  answerCard,
  applyChatBonus,
  applyReward,
  availableNodeIds,
  BASE_MAX_HP,
  buyHeal,
  buyRelic,
  chatBonusGold,
  chatPhraseIds,
  clearNode,
  createRun,
  enterNode,
  eventEffectFor,
  isPracticeRun,
  isScheduledCard,
  leaveShop,
  remainingCardIds,
  rewardOptions,
  shopChoiceCount,
  SHOP_HEAL_PRICE,
  SHOP_RELIC_PRICE,
} from '../src/core/run';
import type { MapNode, NodeType, Run } from '../src/core/types';

function node(id: string, floor: number, type: NodeType, cardIds: string[], next: string[], extra: string[] = []): MapNode {
  return { id, floor, type, cardIds, extraCardIds: extra, answeredCardIds: [], earnedGold: 0, next, cleared: false };
}

function sampleRun(overrides: Partial<Run> = {}): Run {
  const nodes = [
    node('a', 0, 'battle', ['c1', 'c2'], ['s']),
    node('b', 0, 'elite', ['c1', 'c2'], ['s'], ['l1', 'l2']),
    node('s', 1, 'shop', [], ['r', 'e']),
    node('r', 2, 'rest', ['c3'], ['boss']),
    node('e', 2, 'event', ['c3'], ['boss']),
    node('boss', 3, 'boss', ['c4', 'c5'], []),
  ];
  return {
    ...createRun({ id: 'run1', seed: 'seed', date: '2026-10-12', nodes, mainTheme: 'konbini', practice: false, startedAt: 0 }),
    ...overrides,
  };
}

function play(run: Run, nodeId: string, ratings: Array<'good' | 'hard' | 'again'>): Run {
  let r = enterNode(run, nodeId);
  const n = r.nodes.find((x) => x.id === nodeId)!;
  remainingCardIds(n).forEach((id, i) => {
    r = answerCard(r, id, ratings[i] ?? 'good', false, 1).run;
  });
  return r;
}

describe('createRun', () => {
  it('기본 maxHp 5, 도시락 유물이면 6', () => {
    expect(sampleRun().maxHp).toBe(BASE_MAX_HP);
    const r = createRun({ id: 'x', seed: 's', date: 'd', nodes: [], mainTheme: null, practice: false, relicIds: ['bento'], startedAt: 0 });
    expect(r.maxHp).toBe(6);
    expect(r.hp).toBe(6);
  });
});

describe('isPracticeRun', () => {
  it('같은 날 런이 이미 있으면 연습 모드', () => {
    expect(isPracticeRun([], '2026-10-12')).toBe(false);
    expect(isPracticeRun([{ date: '2026-10-11' }], '2026-10-12')).toBe(false);
    expect(isPracticeRun([{ date: '2026-10-12' }], '2026-10-12')).toBe(true);
  });
});

describe('이동', () => {
  it('시작 전에는 0층, 진행 중에는 현재 노드, 클리어 후에는 연결된 다음 노드', () => {
    let run = sampleRun();
    expect(availableNodeIds(run)).toEqual(['a', 'b']);
    run = enterNode(run, 'a');
    expect(availableNodeIds(run)).toEqual(['a']);
    expect(() => enterNode(run, 'b')).toThrow();
    run = answerCard(run, 'c1', 'good', false, 1).run;
    run = answerCard(run, 'c2', 'good', false, 1).run;
    run = clearNode(run, 1);
    expect(availableNodeIds(run)).toEqual(['s']);
  });

  it('카드가 남아 있으면 클리어할 수 없다', () => {
    const run = enterNode(sampleRun(), 'a');
    expect(() => clearNode(run, 1)).toThrow();
  });
});

describe('answerCard', () => {
  it('again 은 HP -1, 보스에서는 -2', () => {
    let run = enterNode(sampleRun(), 'a');
    const out = answerCard(run, 'c1', 'again', false, 1);
    expect(out.damage).toBe(1);
    expect(out.run.hp).toBe(4);

    run = sampleRun({ currentNodeId: 'boss' });
    run = { ...run, nodes: run.nodes.map((n) => (n.floor < 3 ? { ...n, cleared: true } : n)) };
    expect(answerCard(run, 'c4', 'again', false, 1).run.hp).toBe(3);
  });

  it('good/hard 는 HP 가 줄지 않는다', () => {
    const run = enterNode(sampleRun(), 'a');
    expect(answerCard(run, 'c1', 'hard', true, 1).run.hp).toBe(5);
  });

  it('HP 0 이면 dead, 이후 이동 불가', () => {
    let run = enterNode(sampleRun({ hp: 1 }), 'a');
    run = answerCard(run, 'c1', 'again', false, 42).run;
    expect(run.status).toBe('dead');
    expect(run.endedAt).toBe(42);
    expect(availableNodeIds(run)).toEqual([]);
    expect(() => answerCard(run, 'c2', 'good', false, 1)).toThrow();
  });

  it('부적은 런마다 첫 오답 1회의 피해를 막는다', () => {
    let run = enterNode(sampleRun({ relicIds: ['omamori'] }), 'a');
    const first = answerCard(run, 'c1', 'again', false, 1);
    expect(first.damage).toBe(0);
    expect(first.negatedBy).toBe('omamori');
    run = first.run;
    expect(answerCard(run, 'c2', 'again', false, 1).damage).toBe(1);
  });

  it('골드: good 3, hard 1, again 0. 메모장은 힌트 정답 1회를 good 으로 쳐준다', () => {
    let run = enterNode(sampleRun({ relicIds: ['memo'] }), 'a');
    const a = answerCard(run, 'c1', 'hard', true, 1);
    expect(a.gold).toBe(3);
    run = a.run;
    const b = answerCard(run, 'c2', 'hard', true, 1);
    expect(b.gold).toBe(1);
    expect(b.run.nodes.find((n) => n.id === 'a')!.earnedGold).toBe(4);
  });

  it('통계를 쌓는다', () => {
    const run = play(sampleRun(), 'a', ['good', 'again']);
    expect(run.stats).toEqual({ good: 1, hard: 0, again: 1 });
  });

  it('엘리트 추가 카드는 FSRS 기록 대상이 아니다', () => {
    const elite = sampleRun().nodes.find((n) => n.id === 'b')!;
    expect(remainingCardIds(elite)).toEqual(['c1', 'c2', 'l1', 'l2']);
    expect(isScheduledCard(elite, 'c1')).toBe(true);
    expect(isScheduledCard(elite, 'l1')).toBe(false);
  });
});

describe('clearNode / 보상', () => {
  it('휴식 노드는 클리어 시 HP +2, maxHp 초과 불가', () => {
    let run = sampleRun({ hp: 2 });
    run = clearNode(play(run, 'a', ['good', 'good']), 1);
    run = leaveShop(enterNode(run, 's'), 1);
    run = clearNode(play(run, 'r', ['good']), 1);
    expect(run.hp).toBe(4);

    let full = sampleRun();
    full = clearNode(play(full, 'a', ['good', 'good']), 1);
    full = leaveShop(enterNode(full, 's'), 1);
    full = clearNode(play(full, 'r', ['good']), 1);
    expect(full.hp).toBe(5);
  });

  it('보스 클리어 시 won', () => {
    let run = sampleRun();
    run = clearNode(play(run, 'a', []), 1);
    run = leaveShop(enterNode(run, 's'), 1);
    run = clearNode(play(run, 'r', []), 1);
    run = clearNode(play(run, 'boss', []), 99);
    expect(run.status).toBe('won');
    expect(run.endedAt).toBe(99);
  });

  it('보상 골드는 답변 기반, 엘리트 2배, 연습 모드 절반', () => {
    const normal = clearNode(play(sampleRun(), 'a', ['good', 'hard']), 1);
    expect(rewardOptions(normal, 'a', false)).toContainEqual({ kind: 'gold', amount: 4 });

    const elite = clearNode(play(sampleRun(), 'b', ['good', 'good', 'good', 'good']), 1);
    expect(rewardOptions(elite, 'b', true)).toContainEqual({ kind: 'gold', amount: 24 });

    const practice = clearNode(play(sampleRun({ practice: true }), 'a', ['good', 'hard']), 1);
    expect(rewardOptions(practice, 'a', false)).toContainEqual({ kind: 'gold', amount: 2 });
  });

  it('유물은 엘리트이거나 전부 good 일 때만 후보에 오른다', () => {
    const run = clearNode(play(sampleRun(), 'a', ['good', 'good']), 1);
    expect(rewardOptions(run, 'a', false).some((o) => o.kind === 'relic')).toBe(false);
    expect(rewardOptions(run, 'a', true).some((o) => o.kind === 'relic')).toBe(true);
  });

  it('HP 가 가득이면 회복 선택지는 없고, 골드 0 이면 골드 선택지도 없다', () => {
    const run = clearNode(play(sampleRun(), 'a', ['again', 'again']), 1);
    const opts = rewardOptions(run, 'a', false);
    expect(opts.some((o) => o.kind === 'gold')).toBe(false);
    expect(opts).toContainEqual({ kind: 'heal', amount: 1 });
    expect(rewardOptions(sampleRun(), 'a', false)).toEqual([]);
  });

  it('applyReward', () => {
    const run = sampleRun({ hp: 3 });
    expect(applyReward(run, { kind: 'gold', amount: 7 }).gold).toBe(7);
    expect(applyReward(run, { kind: 'heal', amount: 1 }).hp).toBe(4);
    const withBento = applyReward(run, { kind: 'relic', relicId: 'bento' });
    expect(withBento.relicIds).toContain('bento');
    expect(withBento.maxHp).toBe(6);
    expect(withBento.hp).toBe(4);
  });

  it('이벤트 효과는 seed 와 노드로 결정적', () => {
    expect(eventEffectFor('s', 'e')).toBe(eventEffectFor('s', 'e'));
  });
});

describe('상점', () => {
  it('카탈로그 유물이 있으면 진열 +1', () => {
    expect(shopChoiceCount(sampleRun())).toBe(3);
    expect(shopChoiceCount(sampleRun({ relicIds: ['catalog'] }))).toBe(4);
  });

  it('유물·회복 구매는 골드를 쓰고, 부족하면 실패', () => {
    const rich = sampleRun({ gold: 100, hp: 2 });
    expect(buyRelic(rich, 'memo').gold).toBe(100 - SHOP_RELIC_PRICE);
    expect(buyHeal(rich)).toMatchObject({ gold: 100 - SHOP_HEAL_PRICE, hp: 4 });
    expect(() => buyRelic(sampleRun({ gold: 10 }), 'memo')).toThrow();
    expect(() => buyHeal(sampleRun({ gold: 100 }))).toThrow(); // HP 가득
  });
});

describe('abandonRun', () => {
  it('진행 중인 런만 포기 처리', () => {
    const run = abandonRun(sampleRun(), 5);
    expect(run.status).toBe('abandoned');
    expect(abandonRun(run, 9).endedAt).toBe(5);
  });
});

describe('보스 대화', () => {
  it('메인 테마 카드만, 보스 카드 먼저, 중복 없이', () => {
    const run = sampleRun();
    const themes: Record<string, 'konbini' | 'cafe'> = { c1: 'konbini', c2: 'cafe', c3: 'konbini', c4: 'konbini', c5: 'cafe' };
    expect(chatPhraseIds(run, (id) => themes[id])).toEqual(['c4', 'c1', 'c3']);
  });

  it('보너스 골드는 승리한 런에만, 연습 모드는 절반', () => {
    expect(chatBonusGold(sampleRun(), 3)).toBe(0);
    expect(chatBonusGold(sampleRun({ status: 'won' }), 3)).toBe(15);
    expect(chatBonusGold(sampleRun({ status: 'won', practice: true }), 3)).toBe(7);
    expect(applyChatBonus(sampleRun({ status: 'won', gold: 10 }), 2).gold).toBe(20);
  });
});
