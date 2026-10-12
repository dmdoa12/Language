import { describe, expect, it } from 'vitest';
import { arabicToKanji, editDistance, gradeAnswer, isExactAnswer, normalizeAnswer } from '../src/core/answer';

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

describe('숫자와 한자·가나 혼용', () => {
  const bag = { ja: 'レジ袋、一枚お願いします。', readings: ['れじぶくろいちまいおねがいします'] };
  const yen = { ja: '千円札しかないんですけど、大丈夫ですか。', readings: ['せんえんさつしかないんですけどだいじょうぶですか'] };

  it('아라비아 숫자를 한자 숫자로 읽는다', () => {
    expect(arabicToKanji(1)).toBe('一');
    expect(arabicToKanji(10)).toBe('十');
    expect(arabicToKanji(120)).toBe('百二十');
    expect(arabicToKanji(1000)).toBe('千');
    expect(arabicToKanji(3500)).toBe('三千五百');
    expect(arabicToKanji(10000)).toBe('一万');
    expect(arabicToKanji(25000)).toBe('二万五千');
    expect(arabicToKanji(0)).toBe('〇');
    expect(normalizeAnswer('１枚')).toBe('一枚');
  });

  it('1枚 = 一枚, 1000円 = 千円', () => {
    expect(gradeAnswer(bag, 'レジ袋1枚お願いします', false).rating).toBe('good');
    expect(gradeAnswer(bag, 'レジ袋１枚お願いします', false).rating).toBe('good');
    expect(gradeAnswer(yen, '1000円札しかないんですけど、大丈夫ですか', false).rating).toBe('good');
  });

  it('한자를 일부만 가나로 써도 같은 문장이면 정답', () => {
    expect(gradeAnswer(bag, 'レジ袋、いちまいお願いします', false).rating).toBe('good');
    expect(gradeAnswer(bag, 'れじぶくろ一枚おねがいします', false).rating).toBe('good');
    expect(gradeAnswer(bag, 'レジ袋一まいおねがいします', false).rating).toBe('good');
    expect(gradeAnswer(bag, 'レジぶくろ1枚お願いします', false).rating).toBe('good');
    expect(gradeAnswer(yen, 'せんえん札しかないんですけど大丈夫ですか', false).rating).toBe('good');
  });

  it('다른 말은 여전히 정답이 아니다', () => {
    expect(gradeAnswer(bag, 'レジ袋、二枚お願いします', false).result).not.toBe('correct');
    expect(gradeAnswer(bag, 'レジ袋2枚お願いします', false).result).not.toBe('correct');
    expect(gradeAnswer(bag, 'レジ袋、にまいお願いします', false).result).not.toBe('correct');
    expect(gradeAnswer(bag, 'レジ袋お願いします', false).result).not.toBe('correct');
    expect(gradeAnswer(bag, '袋一枚お願いします', false).result).not.toBe('correct');
  });

  it('따라 입력 단계에서도 혼용을 인정한다', () => {
    expect(isExactAnswer(bag, 'レジ袋1枚おねがいします')).toBe(true);
  });
});

describe('형태소 분석기 읽기 비교', () => {
  // 가짜 분석기: 알려진 표기를 가타카나 읽기로 바꾼다 (kuromoji 는 가타카나 읽기를 준다)
  const dict: Array<[string, string]> = [
    ['下さい', 'クダサイ'],
    ['ください', 'クダサイ'],
    ['一枚', 'イチマイ'],
    ['レジ袋', 'レジブクロ'],
    ['お願い', 'オネガイ'],
    ['します', 'シマス'],
    ['二枚', 'ニマイ'],
    ['頂けますか', 'イタダケマスカ'],
    ['いただけますか', 'イタダケマスカ'],
    ['温めて', 'アタタメテ'],
    ['暖めて', 'アタタメテ'],
    ['これ', 'コレ'],
    ['肉まん', 'ニクマン'],
    ['を', 'ヲ'],
    ['、', '、'],
    ['。', '。'],
  ];
  const reader = (text: string) => {
    let out = '';
    let rest = text;
    while (rest.length > 0) {
      const hit = dict.find(([w]) => rest.startsWith(w));
      if (hit) {
        out += hit[1];
        rest = rest.slice(hit[0].length);
      } else {
        out += rest[0];
        rest = rest.slice(1);
      }
    }
    return out;
  };

  const warm = { ja: 'これ、温めてもらえますか。', readings: ['これあたためてもらえますか'] };
  const bag = { ja: 'レジ袋、一枚お願いします。', readings: ['れじぶくろいちまいおねがいします'] };

  it('다른 한자 표기도 읽기가 같으면 정답', () => {
    // 분석기 없이는 한 글자 다른 근접 오답(hard)
    expect(gradeAnswer(warm, 'これ暖めてもらえますか', false)).toMatchObject({ result: 'near', rating: 'hard' });
    expect(gradeAnswer(warm, 'これ暖めてもらえますか', false, reader)).toMatchObject({ result: 'correct', rating: 'good' });
  });

  it('음성 인식처럼 한자가 섞인 입력, 숫자 입력', () => {
    expect(gradeAnswer(bag, 'レジ袋1枚お願いします', false, reader).rating).toBe('good');
  });

  it('읽기가 다르면 여전히 오답', () => {
    expect(gradeAnswer(bag, 'レジ袋二枚お願いします', false, reader).result).not.toBe('correct');
  });

  it('분석기가 오류를 내면 기존 판정으로', () => {
    const broken = () => {
      throw new Error('not ready');
    };
    expect(gradeAnswer(warm, 'これ暖めてもらえますか', false, broken).result).toBe('near');
    expect(gradeAnswer(warm, 'これ温めてもらえますか', false, broken).rating).toBe('good');
  });
});

describe('path shim', () => {
  it('사전 주소를 만든다', async () => {
    const { join } = await import('../src/shims/path');
    expect(join('./dict/', 'base.dat.gz')).toBe('./dict/base.dat.gz');
    expect(join('/Language/dict', 'cc.dat.gz')).toBe('/Language/dict/cc.dat.gz');
  });
});
