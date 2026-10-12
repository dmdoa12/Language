import type { Card, ReviewLog } from 'ts-fsrs';
import { DEFAULT_PROFILE, type DayLog, type MinedPhrase, type Profile, type ReviewLogEntry, type StudyCard } from './types';

// 2: 일본에서의 하루 (runs → days). 1(로그라이크) 백업은 학습 방식이 달라 가져오지 않는다.
export const BACKUP_VERSION = 2;

export interface BackupData {
  version: number;
  exportedAt: number;
  cards: StudyCard[];
  reviewLogs: ReviewLogEntry[];
  days: DayLog[];
  minedPhrases: MinedPhrase[];
  profile: Profile;
}

export function serializeBackup(data: Omit<BackupData, 'version'>): string {
  return JSON.stringify({ version: BACKUP_VERSION, ...data });
}

function toDate(value: unknown, field: string): Date {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) throw new Error(`날짜 형식이 잘못됐어요: ${field}`);
  return d;
}

function reviveCard(fsrs: Card): Card {
  return {
    ...fsrs,
    due: toDate(fsrs.due, 'fsrs.due'),
    ...(fsrs.last_review !== undefined ? { last_review: toDate(fsrs.last_review, 'fsrs.last_review') } : {}),
  };
}

function reviveLog(log: ReviewLog): ReviewLog {
  return { ...log, due: toDate(log.due, 'fsrsLog.due'), review: toDate(log.review, 'fsrsLog.review') };
}

function requireArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) throw new Error(`백업 파일에 ${key} 가 없어요.`);
  return v;
}

// JSON 문자열을 검증하고 Date 필드를 되살린다.
export function parseBackup(text: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSON 파일이 아니에요.');
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('백업 형식이 아니에요.');
  const obj = raw as Record<string, unknown>;
  if (obj.version === 1) throw new Error('이전 버전(로그라이크) 백업은 가져올 수 없어요.');
  if (obj.version !== BACKUP_VERSION) throw new Error(`지원하지 않는 백업 버전이에요: ${String(obj.version)}`);
  if (typeof obj.profile !== 'object' || obj.profile === null) throw new Error('백업 파일에 profile 이 없어요.');

  const cards = (requireArray(obj, 'cards') as StudyCard[]).map((c) => {
    if (typeof c.id !== 'string' || !Array.isArray(c.readings) || typeof c.fsrs !== 'object') {
      throw new Error('카드 형식이 잘못됐어요.');
    }
    return { ...c, fsrs: reviveCard(c.fsrs) };
  });
  const reviewLogs = (requireArray(obj, 'reviewLogs') as ReviewLogEntry[]).map((l) => ({
    ...l,
    fsrsLog: reviveLog(l.fsrsLog),
  }));

  return {
    version: BACKUP_VERSION,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : 0,
    cards,
    reviewLogs,
    days: requireArray(obj, 'days') as DayLog[],
    minedPhrases: requireArray(obj, 'minedPhrases') as MinedPhrase[],
    profile: { ...DEFAULT_PROFILE, ...(obj.profile as Partial<Profile>) },
  };
}
