import { allLines } from './dayplan';
import type { DayLineResult, DayLog, Scene, SceneLine, StudyRating, Theme } from './types';

export const EVENING_CHAT_MAX_PHRASES = 12;

export interface CreateDayInput {
  id: string;
  date: string;
  scenes: Scene[];
  startedAt: number;
  stagesAtStart: Record<string, number>;
}

export function createDayLog(input: CreateDayInput): DayLog {
  return {
    ...input,
    results: [],
    status: input.scenes.length === 0 ? 'done' : 'active',
    endedAt: input.scenes.length === 0 ? input.startedAt : null,
  };
}

export interface LinePosition {
  sceneIndex: number;
  lineIndex: number; // 장면 안에서의 순번
  scene: Scene;
  line: SceneLine;
}

// 전체 순번 → 장면·줄 위치. 범위를 벗어나면 null.
export function positionAt(day: Pick<DayLog, 'scenes'>, index: number): LinePosition | null {
  let rest = index;
  for (let s = 0; s < day.scenes.length; s++) {
    const scene = day.scenes[s]!;
    if (rest < scene.lines.length) return { sceneIndex: s, lineIndex: rest, scene, line: scene.lines[rest]! };
    rest -= scene.lines.length;
  }
  return null;
}

export function currentPosition(day: DayLog): LinePosition | null {
  if (day.status === 'done') return null;
  return positionAt(day, day.results.length);
}

export function totalLines(day: Pick<DayLog, 'scenes'>): number {
  return allLines(day.scenes).length;
}

// 다음 줄에 답한 결과를 기록. 마지막 줄이면 하루 완료.
export function recordLine(day: DayLog, cardId: string, rating: StudyRating, now: number): DayLog {
  const pos = currentPosition(day);
  if (!pos) throw new Error('day is already done');
  if (pos.line.cardId !== cardId) throw new Error(`expected ${pos.line.cardId}, got ${cardId}`);
  const result: DayLineResult = { cardId, rating, firstTry: rating === 'good' };
  const results = [...day.results, result];
  const done = results.length >= totalLines(day);
  return { ...day, results, status: done ? 'done' : 'active', endedAt: done ? now : day.endedAt };
}

// 방금 답한 줄이 장면의 마지막 줄이었는가 (장면 결과를 보여줄 때).
export function justFinishedScene(day: DayLog): number | null {
  const n = day.results.length;
  if (n === 0) return null;
  const pos = positionAt(day, n - 1)!;
  return pos.lineIndex === pos.scene.lines.length - 1 ? pos.sceneIndex : null;
}

export interface SceneResult {
  total: number;
  firstTry: number;
  smoothness: number; // 0~1, 한 번에 말한 비율
}

export function sceneResult(day: DayLog, sceneIndex: number): SceneResult {
  const start = day.scenes.slice(0, sceneIndex).reduce((n, s) => n + s.lines.length, 0);
  const scene = day.scenes[sceneIndex];
  if (!scene) throw new Error(`no scene ${sceneIndex}`);
  const results = day.results.slice(start, start + scene.lines.length);
  const firstTry = results.filter((r) => r.firstTry).length;
  return { total: scene.lines.length, firstTry, smoothness: scene.lines.length === 0 ? 0 : firstTry / scene.lines.length };
}

export interface DaySummary {
  answered: number;
  good: number;
  hard: number;
  again: number;
  learnedNew: number;
}

export function summarizeDay(day: DayLog): DaySummary {
  const count = (r: StudyRating) => day.results.filter((x) => x.rating === r).length;
  const newIds = new Set(allLines(day.scenes).filter((l) => l.isNew).map((l) => l.cardId));
  return {
    answered: day.results.length,
    good: count('good'),
    hard: count('hard'),
    again: count('again'),
    learnedNew: day.results.filter((r) => newIds.has(r.cardId)).length,
  };
}

// 오늘 자란 식물: 하루 시작 때보다 정원 단계가 오른 카드.
export function grownCardIds(day: DayLog, stageNow: (cardId: string) => number | null): string[] {
  return [...new Set(day.results.map((r) => r.cardId))].filter((id) => {
    const now = stageNow(id);
    const before = day.stagesAtStart[id] ?? -1;
    return now !== null && now > before;
  });
}

// 하루 마무리 대화 상대: 마지막 장면의 장소. 표현: 오늘 그 장소에서 말한 카드.
export function eveningChatTheme(day: DayLog): Theme | null {
  return day.scenes.at(-1)?.theme ?? null;
}

export function eveningChatPhraseIds(day: DayLog): string[] {
  const theme = eveningChatTheme(day);
  return [
    ...new Set(day.scenes.filter((s) => s.theme === theme).flatMap((s) => s.lines.map((l) => l.cardId))),
  ].slice(0, EVENING_CHAT_MAX_PHRASES);
}
