import { createRng, pick } from './rng';
import { availableOnceRelic, getRelic, hasRelicEffect, unownedRelics } from './relics';
import type { MapNode, Run, StudyRating, Theme } from './types';

export const BASE_MAX_HP = 5;
export const REST_HEAL = 2;
export const BOSS_DAMAGE = 2;
export const SHOP_CHOICES = 3;
export const SHOP_RELIC_PRICE = 40;
export const SHOP_HEAL_PRICE = 15;
export const SHOP_HEAL_AMOUNT = 2;
export const EVENT_GOLD = 10;

const GOLD_PER_RATING: Record<StudyRating, number> = { good: 3, hard: 1, again: 0 };

export interface CreateRunInput {
  id: string;
  seed: string;
  date: string;
  nodes: MapNode[];
  mainTheme: Theme | null;
  practice: boolean;
  relicIds?: string[];
  startedAt: number;
}

export function createRun(input: CreateRunInput): Run {
  const relicIds = input.relicIds ?? [];
  const maxHp = BASE_MAX_HP + (hasRelicEffect({ relicIds }, 'max_hp_plus1') ? 1 : 0);
  return {
    id: input.id,
    seed: input.seed,
    date: input.date,
    nodes: input.nodes,
    currentNodeId: null,
    hp: maxHp,
    maxHp,
    gold: 0,
    relicIds,
    status: 'active',
    startedAt: input.startedAt,
    endedAt: null,
    practice: input.practice,
    mainTheme: input.mainTheme,
    consumedRelicIds: [],
    stats: { good: 0, hard: 0, again: 0 },
  };
}

// 하루 1런 정상 보상. 같은 날 이미 시작한 런이 있으면 연습 모드.
export function isPracticeRun(runsToday: readonly Pick<Run, 'date'>[], date: string): boolean {
  return runsToday.some((r) => r.date === date);
}

export function getNode(run: Run, nodeId: string): MapNode {
  const node = run.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`unknown node ${nodeId}`);
  return node;
}

export function currentNode(run: Run): MapNode | null {
  return run.currentNodeId ? getNode(run, run.currentNodeId) : null;
}

function replaceNode(run: Run, node: MapNode): Run {
  return { ...run, nodes: run.nodes.map((n) => (n.id === node.id ? node : n)) };
}

// 지금 고를 수 있는 노드: 시작 전이면 0층, 현재 노드 진행 중이면 그 노드, 클리어했으면 다음 층 연결.
export function availableNodeIds(run: Run): string[] {
  if (run.status !== 'active') return [];
  const cur = currentNode(run);
  if (!cur) return run.nodes.filter((n) => n.floor === 0).map((n) => n.id);
  if (!cur.cleared) return [cur.id];
  return cur.next;
}

export function enterNode(run: Run, nodeId: string): Run {
  if (!availableNodeIds(run).includes(nodeId)) throw new Error(`node ${nodeId} is not available`);
  return { ...run, currentNodeId: nodeId };
}

// 남은 출제 순서: 층 batch → 연습(엘리트 리치) 카드.
export function remainingCardIds(node: MapNode): string[] {
  return [...node.cardIds, ...node.extraCardIds].filter((id) => !node.answeredCardIds.includes(id));
}

// FSRS 에 기록하는 카드인가 (엘리트 추가 카드는 연습이라 기록하지 않음).
export function isScheduledCard(node: MapNode, cardId: string): boolean {
  return node.cardIds.includes(cardId);
}

export interface AnswerOutcome {
  run: Run;
  damage: number;
  negatedBy: string | null; // 부적으로 막았으면 유물 id
  gold: number;
}

export function answerCard(
  run: Run,
  cardId: string,
  rating: StudyRating,
  hintUsed: boolean,
  now: number,
): AnswerOutcome {
  const node = currentNode(run);
  if (run.status !== 'active' || !node || node.cleared) throw new Error('no active node');
  if (!remainingCardIds(node).includes(cardId)) throw new Error(`card ${cardId} is not pending`);

  const consumed = [...run.consumedRelicIds];

  let damage = rating === 'again' ? (node.type === 'boss' ? BOSS_DAMAGE : 1) : 0;
  let negatedBy: string | null = null;
  if (damage > 0) {
    negatedBy = availableOnceRelic(run, 'negate_wrong_once');
    if (negatedBy) {
      consumed.push(negatedBy);
      damage = 0;
    }
  }

  let gold = GOLD_PER_RATING[rating];
  if (rating === 'hard' && hintUsed) {
    const memo = availableOnceRelic({ ...run, consumedRelicIds: consumed }, 'hint_once');
    if (memo) {
      consumed.push(memo);
      gold = GOLD_PER_RATING.good;
    }
  }

  const hp = Math.max(0, run.hp - damage);
  const updatedNode: MapNode = {
    ...node,
    answeredCardIds: [...node.answeredCardIds, cardId],
    earnedGold: node.earnedGold + gold,
  };
  const dead = hp === 0;
  const next: Run = {
    ...replaceNode(run, updatedNode),
    hp,
    consumedRelicIds: consumed,
    stats: { ...run.stats, [rating]: run.stats[rating] + 1 },
    status: dead ? 'dead' : run.status,
    endedAt: dead ? now : run.endedAt,
  };
  return { run: next, damage, negatedBy, gold };
}

export type EventEffect = 'gold' | 'heal' | 'double_gold';

export const EVENT_LABELS: Record<EventEffect, string> = {
  gold: `길에서 동전을 주웠다 (골드 +${EVENT_GOLD})`,
  heal: '편의점 시식 코너 (체력 +1)',
  double_gold: '포인트 2배 데이 (이 노드 골드 2배)',
};

export function eventEffectFor(seed: string, nodeId: string): EventEffect {
  return pick(createRng(`${seed}:event:${nodeId}`), ['gold', 'heal', 'double_gold'] as const)!;
}

export function nodeGoldMultiplier(run: Run, node: MapNode): number {
  let m = 1;
  if (node.type === 'elite') m *= 2;
  if (node.type === 'event' && eventEffectFor(run.seed, node.id) === 'double_gold') m *= 2;
  if (run.practice) m *= 0.5;
  return m;
}

export function nodeGold(run: Run, node: MapNode): number {
  return Math.floor(node.earnedGold * nodeGoldMultiplier(run, node));
}

function heal(run: Run, amount: number): Run {
  return { ...run, hp: Math.min(run.maxHp, run.hp + amount) };
}

// 노드의 카드를 다 풀었을 때. 휴식 HP+2, 이벤트 효과, 보스면 승리.
export function clearNode(run: Run, now: number): Run {
  const node = currentNode(run);
  if (run.status !== 'active' || !node || node.cleared) throw new Error('no active node');
  if (remainingCardIds(node).length > 0) throw new Error('cards remain');

  let next = replaceNode(run, { ...node, cleared: true });
  if (node.type === 'rest') next = heal(next, REST_HEAL);
  if (node.type === 'event') {
    const effect = eventEffectFor(run.seed, node.id);
    if (effect === 'gold') next = { ...next, gold: next.gold + (run.practice ? EVENT_GOLD / 2 : EVENT_GOLD) };
    if (effect === 'heal') next = heal(next, 1);
  }
  if (node.type === 'boss') next = { ...next, status: 'won', endedAt: now };
  return next;
}

export type RewardOption =
  | { kind: 'gold'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'relic'; relicId: string };

// 보상 3택 1. 골드는 답변 기억량 기반, 유물은 엘리트이거나 FSRS 출제 카드를 전부 good 으로 맞혔을 때만.
export function rewardOptions(run: Run, nodeId: string, perfect: boolean): RewardOption[] {
  const node = getNode(run, nodeId);
  if (node.type === 'shop' || node.type === 'boss') return [];
  const options: RewardOption[] = [];
  const gold = nodeGold(run, node);
  if (gold > 0) options.push({ kind: 'gold', amount: gold });
  if (run.hp < run.maxHp) options.push({ kind: 'heal', amount: 1 });
  if (node.type === 'elite' || perfect) {
    const relic = pick(createRng(`${run.seed}:reward:${node.id}`), unownedRelics(run));
    if (relic) options.push({ kind: 'relic', relicId: relic.id });
  }
  return options;
}

export function addRelic(run: Run, relicId: string): Run {
  if (run.relicIds.includes(relicId) || !getRelic(relicId)) return run;
  const next = { ...run, relicIds: [...run.relicIds, relicId] };
  if (getRelic(relicId)!.effect === 'max_hp_plus1') return { ...next, maxHp: next.maxHp + 1, hp: next.hp + 1 };
  return next;
}

export function applyReward(run: Run, option: RewardOption): Run {
  switch (option.kind) {
    case 'gold':
      return { ...run, gold: run.gold + option.amount };
    case 'heal':
      return heal(run, option.amount);
    case 'relic':
      return addRelic(run, option.relicId);
  }
}

export function shopChoiceCount(run: Run): number {
  return SHOP_CHOICES + (hasRelicEffect(run, 'shop_extra_choice') ? 1 : 0);
}

export function shopRelicOffer(run: Run, nodeId: string): string | null {
  return pick(createRng(`${run.seed}:shop:${nodeId}`), unownedRelics(run))?.id ?? null;
}

export function buyRelic(run: Run, relicId: string): Run {
  if (run.gold < SHOP_RELIC_PRICE || run.relicIds.includes(relicId)) throw new Error('cannot buy relic');
  return addRelic({ ...run, gold: run.gold - SHOP_RELIC_PRICE }, relicId);
}

export function buyHeal(run: Run): Run {
  if (run.gold < SHOP_HEAL_PRICE || run.hp >= run.maxHp) throw new Error('cannot buy heal');
  return heal({ ...run, gold: run.gold - SHOP_HEAL_PRICE }, SHOP_HEAL_AMOUNT);
}

// 상점은 카드가 없으므로 들어가는 즉시 클리어 가능. 신규 카드 학습은 런 밖의 FSRS 흐름이다.
export function leaveShop(run: Run, now: number): Run {
  return clearNode(run, now);
}

export function abandonRun(run: Run, now: number): Run {
  if (run.status !== 'active') return run;
  return { ...run, status: 'abandoned', endedAt: now };
}

export const CHAT_GOLD_PER_PHRASE = 5;
export const CHAT_MAX_PHRASES = 12;

// 보스 대화에 쓸 표현: 이번 런에서 출제된 메인 테마 카드 (보스 카드 먼저).
export function chatPhraseIds(run: Run, themeOf: (cardId: string) => Theme | undefined): string[] {
  const boss = run.nodes.filter((n) => n.type === 'boss').flatMap((n) => n.cardIds);
  const others = run.nodes.filter((n) => n.type !== 'boss').flatMap((n) => n.cardIds);
  const ordered = [...new Set([...boss, ...others])];
  return ordered.filter((id) => themeOf(id) === run.mainTheme).slice(0, CHAT_MAX_PHRASES);
}

// 보스 대화 보너스: 대화에서 쓴 오늘의 표현 수만큼 골드. FSRS·체력과 무관. 승리한 런에만.
export function chatBonusGold(run: Run, usedPhraseCount: number): number {
  if (run.status !== 'won') return 0;
  const base = usedPhraseCount * CHAT_GOLD_PER_PHRASE;
  return run.practice ? Math.floor(base / 2) : base;
}

export function applyChatBonus(run: Run, usedPhraseCount: number): Run {
  return { ...run, gold: run.gold + chatBonusGold(run, usedPhraseCount) };
}
