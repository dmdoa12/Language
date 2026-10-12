// 문장 구조 시각화: 형태소 → 덩어리(내용어 + 뒤따르는 조사·조동사), 품사, 후리가나, 문형 위치, 오답 대조.
// kuromoji 결과를 이 모듈의 MorphToken 으로 옮겨 넘긴다 (분석기 의존 없음).
import { normalizeAnswer } from './answer';

export interface MorphToken {
  surface: string;
  reading: string | null; // 가타카나 (분석기가 모르면 null)
  pos: string; //            品詞 (名詞, 動詞, 助詞 ...)
  posDetail: string; //      品詞細分類1 (自立, 非自立, 接尾 ...)
  basic?: string; //         基本形 (する 등)
}

export type ChunkKind = 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';

export interface RubyPart {
  text: string;
  ruby: string | null; // 한자 부분의 읽기 (히라가나)
}

export interface StructToken {
  surface: string;
  parts: RubyPart[];
  start: number; // 문장 안 글자 위치
  end: number;
  highlighted: boolean; // 문형 태그 부분
}

export interface Chunk {
  kind: ChunkKind;
  tokens: StructToken[];
  text: string;
  reading: string; // 비교용 정규화된 읽기
}

const KANJI = /[一-鿿々〆ヶ]/u;

function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// 한자 부분에만 읽기를 단다: 앞뒤 가나(送り仮名 등)는 읽기에서 떼어낸다.
export function furiganaParts(surface: string, reading: string | null): RubyPart[] {
  if (!reading || !KANJI.test(surface)) return [{ text: surface, ruby: null }];
  const s = Array.from(surface);
  const r = Array.from(kataToHira(reading));
  let head = 0;
  while (head < s.length && !KANJI.test(s[head]!) && kataToHira(s[head]!) === r[head]) head++;
  let tail = 0;
  while (
    tail < s.length - head &&
    !KANJI.test(s[s.length - 1 - tail]!) &&
    kataToHira(s[s.length - 1 - tail]!) === r[r.length - 1 - tail]
  ) {
    tail++;
  }
  const middle = s.slice(head, s.length - tail).join('');
  const middleReading = r.slice(head, r.length - tail).join('');
  const parts: RubyPart[] = [];
  if (head > 0) parts.push({ text: s.slice(0, head).join(''), ruby: null });
  parts.push({ text: middle, ruby: middleReading || null });
  if (tail > 0) parts.push({ text: s.slice(s.length - tail).join(''), ruby: null });
  return parts;
}

function attachesToPrevious(token: MorphToken, prev: MorphToken | undefined): boolean {
  if (!prev) return false;
  if (prev.pos === '接頭詞') return true;
  if (token.pos === '助詞' || token.pos === '助動詞' || token.pos === '記号') return true;
  if ((token.pos === '動詞' || token.pos === '形容詞') && (token.posDetail === '非自立' || token.posDetail === '接尾')) {
    return true;
  }
  if (token.pos === '名詞' && (token.posDetail === '接尾' || token.posDetail === '非自立')) return true;
  // 복합명사·숫자 (ポイント+カード, 一+万円): 조사 없이 명사가 이어지면 한 덩어리
  if (token.pos === '名詞' && prev.pos === '名詞' && token.posDetail !== '代名詞' && prev.posDetail !== '代名詞') return true;
  // 명사 + する (お願い+します, 注文+した)
  if (token.pos === '動詞' && token.basic === 'する' && prev.pos === '名詞') return true;
  return false;
}

function kindOf(pos: string): ChunkKind {
  switch (pos) {
    case '名詞':
      return 'noun';
    case '動詞':
      return 'verb';
    case '形容詞':
      return 'adjective';
    case '副詞':
      return 'adverb';
    default:
      return 'other';
  }
}

// 문형 태그 → 문장에서 찾을 글자열. 〜 와 괄호 설명을 떼고, 남은 것이 문장에 있으면 그 위치.
export function grammarRanges(sentence: string, tags: readonly string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const tag of tags) {
    const needle = tag.replace(/[〜~]/g, '').replace(/[(（].*?[)）]/g, '').trim();
    if (needle.length < 2) continue;
    const at = sentence.indexOf(needle);
    if (at >= 0) ranges.push([at, at + needle.length]);
  }
  return ranges;
}

export function buildChunks(tokens: readonly MorphToken[], grammarTags: readonly string[] = []): Chunk[] {
  const sentence = tokens.map((t) => t.surface).join('');
  const ranges = grammarRanges(sentence, grammarTags);
  const groups: Array<{ kind: ChunkKind; tokens: StructToken[]; raw: string[] }> = [];
  let offset = 0;
  tokens.forEach((t, i) => {
    const start = offset;
    const end = offset + t.surface.length;
    offset = end;
    const st: StructToken = {
      surface: t.surface,
      parts: furiganaParts(t.surface, t.reading),
      start,
      end,
      highlighted: t.pos !== '記号' && ranges.some(([a, b]) => start < b && end > a),
    };
    const last = groups.at(-1);
    if (last && attachesToPrevious(t, tokens[i - 1])) {
      // 접두사(お, ご)로 시작한 덩어리는 다음 내용어의 품사를 따른다
      if (tokens[i - 1]!.pos === '接頭詞' && last.tokens.length === 1) last.kind = kindOf(t.pos);
      last.tokens.push(st);
      last.raw.push(t.reading ?? t.surface);
    } else {
      groups.push({ kind: kindOf(t.pos), tokens: [st], raw: [t.reading ?? t.surface] });
    }
  });

  const chunks: Chunk[] = [];
  for (const g of groups) {
    const reading = normalizeAnswer(g.raw.join(''));
    const prev = chunks.at(-1);
    // 구두점만 있는 덩어리는 앞 덩어리에 붙인다
    if (reading === '' && prev) {
      prev.tokens.push(...g.tokens);
      prev.text += g.tokens.map((t) => t.surface).join('');
      continue;
    }
    chunks.push({ kind: g.kind, tokens: g.tokens, text: g.tokens.map((t) => t.surface).join(''), reading });
  }
  return chunks;
}

// 덩어리 읽기 두 줄을 LCS 로 맞춰, 서로 대응하지 않는 덩어리를 표시한다.
export function diffChunks(expected: readonly string[], actual: readonly string[]): { expected: boolean[]; actual: boolean[] } {
  const n = expected.length;
  const m = actual.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = expected[i] === actual[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const e = new Array<boolean>(n).fill(false);
  const a = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (expected[i] === actual[j]) {
      e[i] = true;
      a[j] = true;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return { expected: e, actual: a };
}
