import { THEME_ORDER, type Scene, type SceneLine, type StudyCard, type Theme } from './types';

export const MAX_LINES_PER_SCENE = 8;

export interface DayPlanInput {
  due: readonly StudyCard[]; //   오늘 due 카드 (retrievability 오름차순 = 잊기 쉬운 순)
  fresh: readonly StudyCard[]; // 오늘 새로 배울 카드 (이미 한도만큼 잘린 덱 순서)
}

// 순서를 유지한 채 n 개 덩어리로 균등 분할 (앞쪽이 1개 더 많을 수 있음).
function splitEvenly<T>(items: readonly T[], n: number): T[][] {
  const base = Math.floor(items.length / n);
  const extra = items.length % n;
  const out: T[][] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const size = base + (k < extra ? 1 : 0);
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out;
}

// 하루 장면 구성: 장소(테마) 순서대로, 각 장소는 due(잊기 쉬운 순) 뒤에 신규.
// 한 장면 최대 8줄. 넘으면 같은 장소를 균등하게 나눈다. 같은 입력 → 같은 하루.
export function planDay({ due, fresh }: DayPlanInput): Scene[] {
  const scenes: Scene[] = [];
  const themes: Theme[] = [
    ...THEME_ORDER,
    // THEME_ORDER 에 없는 테마는 없지만, 혹시 생기면 뒤에 붙인다
    ...[...due, ...fresh].map((c) => c.theme).filter((t) => !THEME_ORDER.includes(t)),
  ];
  for (const theme of [...new Set(themes)]) {
    const lines: SceneLine[] = [
      ...due.filter((c) => c.theme === theme).map((c) => ({ cardId: c.id, isNew: false })),
      ...fresh.filter((c) => c.theme === theme).map((c) => ({ cardId: c.id, isNew: true })),
    ];
    if (lines.length === 0) continue;
    const parts = Math.ceil(lines.length / MAX_LINES_PER_SCENE);
    splitEvenly(lines, parts).forEach((chunk, i) => {
      scenes.push({ id: `${theme}-${i + 1}`, theme, part: i + 1, parts, lines: chunk });
    });
  }
  return scenes;
}

export function allLines(scenes: readonly Scene[]): SceneLine[] {
  return scenes.flatMap((s) => s.lines);
}
