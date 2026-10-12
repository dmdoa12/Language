import { describe, expect, it } from 'vitest';
import { buildChunks, diffChunks, furiganaParts, grammarRanges, type MorphToken } from '../src/core/structure';

// kuromoji 가 「これ、温めてもらえますか。」를 나누는 방식
const tokens: MorphToken[] = [
  { surface: 'これ', reading: 'コレ', pos: '名詞', posDetail: '代名詞' },
  { surface: '、', reading: '、', pos: '記号', posDetail: '読点' },
  { surface: '温め', reading: 'アタタメ', pos: '動詞', posDetail: '自立' },
  { surface: 'て', reading: 'テ', pos: '助詞', posDetail: '接続助詞' },
  { surface: 'もらえ', reading: 'モラエ', pos: '動詞', posDetail: '非自立' },
  { surface: 'ます', reading: 'マス', pos: '助動詞', posDetail: '*' },
  { surface: 'か', reading: 'カ', pos: '助詞', posDetail: '副助詞／並立助詞／終助詞' },
  { surface: '。', reading: '。', pos: '記号', posDetail: '句点' },
];

describe('furiganaParts', () => {
  it('한자 부분에만 읽기를 단다 (送り仮名 제외)', () => {
    expect(furiganaParts('温め', 'アタタメ')).toEqual([
      { text: '温', ruby: 'あたた' },
      { text: 'め', ruby: null },
    ]);
    expect(furiganaParts('お願い', 'オネガイ')).toEqual([
      { text: 'お', ruby: null },
      { text: '願', ruby: 'ねが' },
      { text: 'い', ruby: null },
    ]);
    expect(furiganaParts('大丈夫', 'ダイジョウブ')).toEqual([{ text: '大丈夫', ruby: 'だいじょうぶ' }]);
  });

  it('한자가 없거나 읽기를 모르면 그대로', () => {
    expect(furiganaParts('これ', 'コレ')).toEqual([{ text: 'これ', ruby: null }]);
    expect(furiganaParts('袋', null)).toEqual([{ text: '袋', ruby: null }]);
  });
});

describe('buildChunks', () => {
  it('내용어 + 뒤따르는 조사·조동사로 덩어리를 만든다', () => {
    const chunks = buildChunks(tokens);
    expect(chunks.map((c) => c.text)).toEqual(['これ、', '温めてもらえますか。']);
    expect(chunks.map((c) => c.kind)).toEqual(['noun', 'verb']);
    expect(chunks.map((c) => c.reading)).toEqual(['これ', 'あたためてもらえますか']);
  });

  it('문형 태그 위치를 표시한다 (〜 와 괄호 설명은 떼고 찾음)', () => {
    expect(grammarRanges('これ、温めてもらえますか。', ['〜てもらえますか', '可能形'])).toEqual([[5, 12]]);
    const chunks = buildChunks(tokens, ['〜てもらえますか']);
    const lit = chunks.flatMap((c) => c.tokens).filter((t) => t.highlighted).map((t) => t.surface);
    expect(lit).toEqual(['て', 'もらえ', 'ます', 'か']);
  });
});

describe('diffChunks', () => {
  it('대응하지 않는 덩어리를 표시한다', () => {
    const r = diffChunks(['これ', 'あたためて', 'もらえますか'], ['これ', 'あたためて', 'ください']);
    expect(r.expected).toEqual([true, true, false]);
    expect(r.actual).toEqual([true, true, false]);
  });

  it('빠진 덩어리', () => {
    const r = diffChunks(['れじぶくろ', 'いちまい', 'おねがいします'], ['れじぶくろ', 'おねがいします']);
    expect(r.expected).toEqual([true, false, true]);
    expect(r.actual).toEqual([true, true]);
  });
});

describe('덩어리 다듬기', () => {
  const tk = (surface: string, reading: string, pos: string, posDetail: string, basic?: string): MorphToken => ({
    surface,
    reading,
    pos,
    posDetail,
    basic,
  });

  it('복합명사·숫자는 한 덩어리', () => {
    const chunks = buildChunks([
      tk('一', 'イチ', '名詞', '数'),
      tk('万', 'マン', '名詞', '数'),
      tk('円', 'エン', '名詞', '接尾'),
      tk('でも', 'デモ', '助詞', '副助詞'),
    ]);
    expect(chunks.map((c) => c.text)).toEqual(['一万円でも']);
  });

  it('명사 + する 는 한 덩어리, 접두사 덩어리는 다음 품사를 따른다', () => {
    const chunks = buildChunks([
      tk('お', 'オ', '接頭詞', '名詞接続'),
      tk('願い', 'ネガイ', '名詞', '一般'),
      tk('し', 'シ', '動詞', '自立', 'する'),
      tk('ます', 'マス', '助動詞', '*'),
    ]);
    expect(chunks.map((c) => [c.text, c.kind])).toEqual([['お願いします', 'noun']]);
  });

  it('대명사 뒤 명사는 나눈다', () => {
    const chunks = buildChunks([tk('これ', 'コレ', '名詞', '代名詞'), tk('袋', 'フクロ', '名詞', '一般')]);
    expect(chunks.map((c) => c.text)).toEqual(['これ', '袋']);
  });
});
