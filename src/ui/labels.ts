import type { NodeType, Theme } from '../core/types';

export const THEME_LABELS: Record<Theme, string> = {
  konbini: '편의점',
  cafe: '카페',
  restaurant: '식당',
  directions: '길 찾기',
  friends_plan: '친구와 약속',
  smalltalk: '잡담',
  consult: '상담',
};

export const NODE_LABELS: Record<NodeType, string> = {
  battle: '전투',
  elite: '엘리트',
  rest: '휴식',
  event: '이벤트',
  shop: '상점',
  boss: '보스',
};
