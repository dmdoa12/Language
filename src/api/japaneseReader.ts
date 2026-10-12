// kuromoji 형태소 분석기로 일본어 문장의 읽기(가타카나)를 얻는다.
// 사전(약 17MB)은 앱이 뜬 뒤 백그라운드에서 한 번 받고 서비스 워커가 캐시한다.
// 준비되기 전에는 getReader() 가 null 이라 채점은 기존 방식으로 진행된다.
import type { IpadicFeatures, Tokenizer } from 'kuromoji';
import type { Reader } from '../core/answer';
import type { MorphToken } from '../core/structure';

let tokenizer: Tokenizer<IpadicFeatures> | null = null;
let loading: Promise<void> | null = null;

export type ReaderStatus = 'idle' | 'loading' | 'ready' | 'failed';
let status: ReaderStatus = 'idle';

export function readerStatus(): ReaderStatus {
  return status;
}

export function getReader(): Reader | null {
  const t = tokenizer;
  if (!t) return null;
  return (text) =>
    t
      .tokenize(text)
      .map((token) => (token.reading && token.reading !== '*' ? token.reading : token.surface_form))
      .join('');
}

export function loadReader(): Promise<void> {
  if (loading) return loading;
  status = 'loading';
  loading = import('kuromoji')
    .then(
      (mod) =>
        new Promise<void>((resolve, reject) => {
          const kuromoji = (mod as unknown as { default?: typeof mod }).default ?? mod;
          kuromoji.builder({ dicPath: `${import.meta.env.BASE_URL}dict/` }).build((err, built) => {
            if (err) {
              reject(err);
              return;
            }
            tokenizer = built;
            status = 'ready';
            for (const fn of listeners) fn();
            resolve();
          });
        }),
    )
    .catch((e: unknown) => {
      status = 'failed';
      loading = null; // 다음 기회에 다시 시도
      console.warn('kuromoji 사전을 불러오지 못했어요', e);
    });
  return loading;
}

// 문장 구조 시각화용 형태소 (사전이 준비되기 전이면 null).
export function getMorphTokens(text: string): MorphToken[] | null {
  const t = tokenizer;
  if (!t) return null;
  return t.tokenize(text).map((x) => ({
    surface: x.surface_form,
    reading: x.reading && x.reading !== '*' ? x.reading : null,
    pos: x.pos,
    posDetail: x.pos_detail_1,
    basic: x.basic_form,
  }));
}

// 사전 준비 완료를 기다리는 화면용 구독.
const listeners = new Set<() => void>();
export function onReaderReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
