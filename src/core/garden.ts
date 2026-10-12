import { getRetrievability } from './fsrs';
import { MASTERED_STABILITY, UNLOCK_STABILITY } from './meta';
import type { StudyCard } from './types';

// 정원 단계: 0 씨앗(< 1일) · 1 새싹(≥ 1일) · 2 잎(≥ 7일, 익숙) · 3 꽃(≥ 21일, 숙달)
export type PlantStage = 0 | 1 | 2 | 3;

export const STAGE_LABELS: Record<PlantStage, string> = { 0: '씨앗', 1: '새싹', 2: '잎', 3: '꽃' };
export const SPROUT_STABILITY = 1;
export const WILT_RETRIEVABILITY = 0.75;

export interface Plant {
  cardId: string;
  stage: PlantStage;
  wilted: boolean; //   지금 기억할 확률이 낮음 (복습하면 회복)
  special: boolean; //  수집함에서 만든 표현
  retrievability: number;
  stability: number;
  dueAt: number;
}

export function plantStage(stability: number): PlantStage {
  if (stability >= MASTERED_STABILITY) return 3;
  if (stability >= UNLOCK_STABILITY) return 2;
  if (stability >= SPROUT_STABILITY) return 1;
  return 0;
}

// 아직 안 배운 카드는 식물이 없다 (null).
export function plantOf(card: StudyCard, now: Date): Plant | null {
  if (card.introducedAt === null) return null;
  const retrievability = getRetrievability(card.fsrs, now);
  const reviewed = card.fsrs.reps > 0;
  return {
    cardId: card.id,
    stage: plantStage(card.fsrs.stability),
    // 한 번도 복습 안 한 막 배운 씨앗은 시든 것으로 보지 않는다
    wilted: reviewed && retrievability < WILT_RETRIEVABILITY,
    special: card.source === 'mined',
    retrievability,
    stability: card.fsrs.stability,
    dueAt: card.fsrs.due.getTime(),
  };
}

export interface GardenStats {
  plants: number;
  byStage: Record<PlantStage, number>;
  wilted: number;
}

export function gardenStats(cards: readonly StudyCard[], now: Date): GardenStats {
  const byStage: Record<PlantStage, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  let plants = 0;
  let wilted = 0;
  for (const c of cards) {
    const p = plantOf(c, now);
    if (!p) continue;
    plants++;
    byStage[p.stage]++;
    if (p.wilted) wilted++;
  }
  return { plants, byStage, wilted };
}

// 하루 시작 때 단계 스냅샷 (안 배운 카드는 -1 로 보고 기록하지 않는다).
export function stageSnapshot(cards: readonly StudyCard[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) if (c.introducedAt !== null) out[c.id] = plantStage(c.fsrs.stability);
  return out;
}
