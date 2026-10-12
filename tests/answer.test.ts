import { describe, expect, it } from 'vitest';
import { editDistance, gradeAnswer, isExactAnswer, normalizeAnswer } from '../src/core/answer';

const card = {
  ja: 'レジ袋は大丈夫です。',
  readings: ['れじぶくろはだいじょうぶです'],
};

describe('normalizeAnswer', () => {
  it('가타카나를 히라가나로 바꾸되 장음 ー는 유지한다', () => {
    expect(normalizeAnswer('コーヒー')).toBe('こーひー');
  });

  it('로마자 입력을 히라가나로 바꾼다', () => {
    expect(normalizeAnswer('ko-hi-')).toBe('こーひー');
    expect(normalizeAnswer('KO-HI-')).toBe('こーひー');
    expect(normalizeAnswer('onegaishimasu')).toBe('おねがいします');
  });

  it('반각 가타카나와 전각 영숫자를 정규화한다', () => {
    expect(normalizeAnswer('ﾚｼﾞ袋')).toBe('れじ袋');
    expect(normalizeAnswer('ＡＢ')).toBe(normalizeAnswer('ab'));
  });

  it('공백과 구두점·기호를 제거한다', () => {
    expect(normalizeAnswer(' すみません、 これ ください！ ')).toBe('すみませんこれください');
    expect(normalizeAnswer('え…と？')).toBe('えと');
    expect(normalizeAnswer('〜ですか。')).toBe('ですか');
  });

  it('한자는 그대로 둔다', () => {
    expect(normalizeAnswer('温めてください')).toBe('温めてください');
  });
});

describe('editDistance', () => {
  it('레벤슈타인 거리를 계산한다', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('abc', 'abd')).toBe(1);
    expect(editDistance('abc', 'ab')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('gradeAnswer', () => {
  it('readings와 일치하면 good', () => {
    const r = gradeAnswer(card, 'れじぶくろはだいじょうぶです', false);
    expect(r).toEqual({ result: 'correct', rating: 'good' });
  });

  it('ja 원문과 일치해도 정답 (구두점 차이 무시)', () => {
    expect(gradeAnswer(card, 'レジ袋は大丈夫です', false).rating).toBe('good');
  });

  it('가타카나·로마자 입력도 정답', () => {
    expect(gradeAnswer(card, 'rejibukurohadaijoubudesu', false).rating).toBe('good');
    expect(gradeAnswer(card, 'レジぶくろはだいじょうぶです', false).rating).toBe('good');
  });

  it('정답이어도 힌트를 쓰면 hard', () => {
    expect(gradeAnswer(card, 'れじぶくろはだいじょうぶです', true)).toEqual({
      result: 'correct',
      rating: 'hard',
    });
  });

  it('길이 8 이상 정답과 편집 거리 1이면 근접 오답 hard', () => {
    expect(gradeAnswer(card, 'れじぶくろはだいじょぶです', false)).toEqual({
      result: 'near',
      rating: 'hard',
    });
  });

  it('짧은 정답(정규화 후 8 미만)은 편집 거리 1이어도 again', () => {
    const short = { ja: 'はい。', readings: ['はい'] };
    expect(gradeAnswer(short, 'はえ', false)).toEqual({ result: 'wrong', rating: 'again' });
  });

  it('편집 거리 2 이상은 again', () => {
    expect(gradeAnswer(card, 'れじぶくろはだいじょぶでし', false).rating).toBe('again');
  });

  it('빈 입력은 again', () => {
    expect(gradeAnswer(card, '   ', false).rating).toBe('again');
  });

  it('장음 ー를 모음으로 쓰면 정답이 아니다', () => {
    const coffee = { ja: 'ホットコーヒーをください。', readings: ['ほっとこーひーをください'] };
    expect(gradeAnswer(coffee, 'ホットコーヒーをください', false).rating).toBe('good');
    expect(gradeAnswer(coffee, 'ほっとこうひいをください', false).result).not.toBe('correct');
  });
});

describe('isExactAnswer', () => {
  it('따라 입력 단계는 근접 오답을 통과시키지 않는다', () => {
    expect(isExactAnswer(card, 'れじぶくろはだいじょうぶです')).toBe(true);
    expect(isExactAnswer(card, 'れじぶくろはだいじょぶです')).toBe(false);
  });
});
