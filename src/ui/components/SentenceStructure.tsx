import { getMorphTokens } from '../../api/japaneseReader';
import { buildChunks, diffChunks, type Chunk } from '../../core/structure';
import { useReaderReady } from '../useReader';

const KIND_LABEL = { noun: '명사', verb: '동사', adjective: '형용사', adverb: '부사', other: '기타' } as const;

function ChunkView({ chunk, mismatch }: { chunk: Chunk; mismatch?: boolean }) {
  return (
    <span className={`chunk kind-${chunk.kind}${mismatch ? ' mismatch' : ''}`} title={KIND_LABEL[chunk.kind]}>
      {chunk.tokens.map((t, i) => (
        <span key={i} className={t.highlighted ? 'gram' : undefined}>
          {t.parts.map((p, j) =>
            p.ruby ? (
              <ruby key={j}>
                {p.text}
                <rt>{p.ruby}</rt>
              </ruby>
            ) : (
              <span key={j}>{p.text}</span>
            ),
          )}
        </span>
      ))}
    </span>
  );
}

interface Props {
  text: string;
  grammarTags?: readonly string[];
  // 오답일 때 내 답과 덩어리 단위로 대조
  compareInput?: string | null;
}

export function SentenceStructure({ text, grammarTags = [], compareInput }: Props) {
  useReaderReady();
  const tokens = getMorphTokens(text);
  if (!tokens) {
    return (
      <p className="structure plain" lang="ja">
        {text}
      </p>
    );
  }
  const chunks = buildChunks(tokens, grammarTags);
  const inputTokens = compareInput ? getMorphTokens(compareInput) : null;

  if (!inputTokens) {
    return (
      <p className="structure" lang="ja">
        {chunks.map((c, i) => (
          <ChunkView key={i} chunk={c} />
        ))}
      </p>
    );
  }

  const mine = buildChunks(inputTokens);
  const diff = diffChunks(
    chunks.map((c) => c.reading),
    mine.map((c) => c.reading),
  );
  return (
    <div className="structure-compare">
      <p className="structure" lang="ja">
        <span className="row-label">정답</span>
        {chunks.map((c, i) => (
          <ChunkView key={i} chunk={c} mismatch={!diff.expected[i]} />
        ))}
      </p>
      <p className="structure" lang="ja">
        <span className="row-label">내 답</span>
        {mine.map((c, i) => (
          <ChunkView key={i} chunk={c} mismatch={!diff.actual[i]} />
        ))}
      </p>
    </div>
  );
}
