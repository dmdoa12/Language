import type { Theme } from '../core/types';

export const THEME_LABELS: Record<Theme, string> = {
  konbini: '편의점',
  cafe: '카페',
  restaurant: '식당',
  directions: '길 찾기',
  friends_plan: '친구와 약속',
  smalltalk: '잡담',
  consult: '상담',
};

// 하루 흐름 속 장소 안내와 상대
export const THEME_SCENES: Record<Theme, { time: string; intro: string; partner: string }> = {
  konbini: { time: '아침', intro: '출근길에 편의점에 들렀다.', partner: '점원' },
  cafe: { time: '오전', intro: '동네 카페에서 잠깐 쉬어 간다.', partner: '점원' },
  restaurant: { time: '점심', intro: '근처 식당에서 점심을 먹는다.', partner: '점원' },
  directions: { time: '오후', intro: '처음 가 보는 동네에서 길을 찾는다.', partner: '지나가던 사람' },
  friends_plan: { time: '저녁', intro: '친구와 주말 약속을 잡는다.', partner: '친구' },
  smalltalk: { time: '밤', intro: '아는 사람과 가볍게 이야기한다.', partner: '아는 사람' },
  consult: { time: '밤', intro: '친구에게 고민을 털어놓는다.', partner: '친구' },
};

// 오답·근접 오답일 때 상대의 반응 (불이익 없이 분위기만)
export const MISHEARD_REPLY = 'すみません、もう一度いいですか？';
