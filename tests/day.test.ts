import { describe, expect, it } from 'vitest';
import {
  createDayLog,
  currentPosition,
  eveningChatPhraseIds,
  eveningChatTheme,
  grownCardIds,
  justFinishedScene,
  positionAt,
  recordLine,
  sceneResult,
  summarizeDay,
  totalLines,
} from '../src/core/day';
import type { DayLog, Scene } from '../src/core/types';

const scenes: Scene[] = [
  { id: 'konbini-1', theme: 'konbini', part: 1, parts: 1, lines: [{ cardId: 'k1', isNew: false }, { cardId: 'k2', isNew: true }] },
  { id: 'cafe-1', theme: 'cafe', part: 1, parts: 1, lines: [{ cardId: 'c1', isNew: false }] },
];

function day(): DayLog {
  return createDayLog({ id: 'd1', date: '2026-10-12', scenes, startedAt: 0, stagesAtStart: { k1: 1, c1: 2 } });
}

describe('하루 진행', () => {
  it('순서대로 위치를 준다', () => {
    const d = day();
    expect(totalLines(d)).toBe(3);
    expect(currentPosition(d)).toMatchObject({ sceneIndex: 0, lineIndex: 0, line: { cardId: 'k1' } });
    expect(positionAt(d, 2)).toMatchObject({ sceneIndex: 1, lineIndex: 0 });
    expect(positionAt(d, 3)).toBeNull();
  });

  it('답을 기록하고 마지막 줄이면 완료', () => {
    let d = recordLine(day(), 'k1', 'good', 1);
    expect(justFinishedScene(d)).toBeNull();
    d = recordLine(d, 'k2', 'again', 2);
    expect(justFinishedScene(d)).toBe(0);
    expect(d.status).toBe('active');
    d = recordLine(d, 'c1', 'hard', 3);
    expect(d.status).toBe('done');
    expect(d.endedAt).toBe(3);
    expect(currentPosition(d)).toBeNull();
    expect(() => recordLine(d, 'c1', 'good', 4)).toThrow();
  });

  it('순서가 다른 카드는 기록하지 않는다', () => {
    expect(() => recordLine(day(), 'c1', 'good', 1)).toThrow();
  });

  it('틀려도 진행은 그대로, 장면 매끄러움은 한 번에 말한 비율', () => {
    let d = recordLine(day(), 'k1', 'good', 1);
    d = recordLine(d, 'k2', 'again', 2);
    expect(sceneResult(d, 0)).toEqual({ total: 2, firstTry: 1, smoothness: 0.5 });
  });

  it('하루 요약', () => {
    let d = recordLine(day(), 'k1', 'good', 1);
    d = recordLine(d, 'k2', 'hard', 2);
    d = recordLine(d, 'c1', 'again', 3);
    expect(summarizeDay(d)).toEqual({ answered: 3, good: 1, hard: 1, again: 1, learnedNew: 1 });
  });

  it('오늘 자란 식물: 시작 때보다 단계가 오른 카드 (새로 배운 카드 포함)', () => {
    let d = recordLine(day(), 'k1', 'good', 1);
    d = recordLine(d, 'k2', 'good', 2);
    d = recordLine(d, 'c1', 'good', 3);
    const now: Record<string, number> = { k1: 2, k2: 0, c1: 2 };
    expect(grownCardIds(d, (id) => now[id] ?? null).sort()).toEqual(['k1', 'k2']);
  });

  it('장면이 없으면 바로 완료된 하루', () => {
    const d = createDayLog({ id: 'x', date: '2026-10-12', scenes: [], startedAt: 5, stagesAtStart: {} });
    expect(d.status).toBe('done');
    expect(d.endedAt).toBe(5);
  });

  it('하루 마무리 대화: 마지막 장소와 그 장소 표현', () => {
    expect(eveningChatTheme(day())).toBe('cafe');
    expect(eveningChatPhraseIds(day())).toEqual(['c1']);
  });
});
