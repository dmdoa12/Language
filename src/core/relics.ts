import type { Relic, Run } from './types';

export const RELICS: readonly Relic[] = [
  {
    id: 'memo',
    name: '메모장',
    description: '런마다 한 번, 힌트를 쓰고 맞혀도 골드를 정답과 똑같이 받아요.',
    effect: 'hint_once',
  },
  {
    id: 'omamori',
    name: '부적',
    description: '런마다 한 번, 틀려도 체력이 줄지 않아요.',
    effect: 'negate_wrong_once',
  },
  {
    id: 'catalog',
    name: '카탈로그',
    description: '상점에 새 표현이 한 장 더 진열돼요.',
    effect: 'shop_extra_choice',
  },
  {
    id: 'bento',
    name: '든든한 도시락',
    description: '최대 체력이 1 늘어나요.',
    effect: 'max_hp_plus1',
  },
];

const BY_ID = new Map(RELICS.map((r) => [r.id, r]));

export function getRelic(id: string): Relic | undefined {
  return BY_ID.get(id);
}

function relicWithEffect(run: Pick<Run, 'relicIds'>, effect: Relic['effect']): Relic | undefined {
  return run.relicIds.map(getRelic).find((r) => r?.effect === effect);
}

export function hasRelicEffect(run: Pick<Run, 'relicIds'>, effect: Relic['effect']): boolean {
  return relicWithEffect(run, effect) !== undefined;
}

// 1회성 효과: 보유 중이고 이번 런에서 아직 안 썼으면 그 유물 id.
export function availableOnceRelic(
  run: Pick<Run, 'relicIds' | 'consumedRelicIds'>,
  effect: 'hint_once' | 'negate_wrong_once',
): string | null {
  const relic = relicWithEffect(run, effect);
  if (!relic || run.consumedRelicIds.includes(relic.id)) return null;
  return relic.id;
}

export function unownedRelics(run: Pick<Run, 'relicIds'>): Relic[] {
  return RELICS.filter((r) => !run.relicIds.includes(r.id));
}
