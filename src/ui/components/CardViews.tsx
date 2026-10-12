import { useEffect, useState, type ReactNode } from 'react';
import type { AnswerGrade } from '../../core/answer';
import type { JudgeVerdict } from '../../core/judge';
import { buildHint } from '../../core/session';
import type { StudyCard } from '../../core/types';
import { THEME_LABELS } from '../labels';
import { speak } from '../tts';
import { AnswerPanel } from './AnswerPanel';
import { JaInput } from './JaInput';

const RESULT_LABEL = {
  correct: '정답',
  near: '아까워요 (근접 오답)',
  equivalent: '뜻은 통해요 (다른 표현)',
  wrong: '오답',
} as const;

export function CardStudy({ card, onDone }: { card: StudyCard; onDone: (input: string) => boolean }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => speak(card.ja), [card.id, card.ja]);
  return (
    <>
      <p className="badge">새 표현 · {THEME_LABELS[card.theme]}</p>
      <p className="situation">{card.situation}</p>
      <AnswerPanel card={card} />
      <JaInput
        key={`study-${card.id}`}
        placeholder="위 문장을 그대로 입력"
        submitLabel="외웠어요"
        error={error}
        onSubmit={(v) => {
          const ok = onDone(v);
          setError(ok ? null : '문장과 똑같이 입력해 주세요.');
          return ok;
        }}
      />
    </>
  );
}

interface QuestionProps {
  card: StudyCard;
  hintUsed: boolean;
  onHint: () => void;
  onSubmit: (input: string) => void | Promise<void>;
  badge?: ReactNode;
  busy?: boolean;
}

export function CardQuestion({ card, hintUsed, onHint, onSubmit, badge, busy }: QuestionProps) {
  return (
    <>
      <p className="badge">{badge ?? THEME_LABELS[card.theme]}</p>
      <p className="situation">{card.situation}</p>
      <p className="prompt-ko">{card.ko}</p>
      {hintUsed ? (
        <p className="hint" lang="ja">
          {buildHint(card)}
        </p>
      ) : (
        <button type="button" className="link" onClick={onHint}>
          힌트 보기 (등급이 낮아져요)
        </button>
      )}
      <JaInput
        key={`q-${card.id}`}
        placeholder="일본어로 말해 보세요"
        submitLabel="확인"
        onSubmit={onSubmit}
        busy={busy}
      />
    </>
  );
}

interface ResultProps {
  card: StudyCard;
  grade: AnswerGrade;
  lastInput: string;
  copied: boolean;
  onCopy: (input: string) => boolean;
  onNext: () => void;
  extra?: ReactNode;
  verdict?: JudgeVerdict | null;
}

function Feedback({ verdict }: { verdict: JudgeVerdict }) {
  if (!verdict.feedback && !verdict.corrected) return null;
  return (
    <section className="feedback">
      <span className="label">AI 첨삭</span>
      {verdict.feedback ? <p>{verdict.feedback}</p> : null}
      {verdict.corrected ? (
        <p lang="ja">
          자연스럽게: <strong>{verdict.corrected}</strong>
        </p>
      ) : null}
    </section>
  );
}

export function CardResult({ card, grade, lastInput, copied, onCopy, onNext, extra, verdict }: ResultProps) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => speak(card.ja), [card.id, card.ja]);
  return (
    <>
      <p className={`verdict verdict-${grade.result}`}>{RESULT_LABEL[grade.result]}</p>
      {extra}
      <p className="your-input">
        내 답: <span lang="ja">{lastInput}</span>
      </p>
      {verdict ? <Feedback verdict={verdict} /> : null}
      <AnswerPanel card={card} />
      {copied ? (
        <button type="button" className="primary" onClick={onNext} autoFocus>
          다음
        </button>
      ) : (
        <JaInput
          key={`copy-${card.id}`}
          placeholder="정답을 한 번 따라 입력"
          submitLabel="따라 입력 완료"
          error={error}
          onSubmit={(v) => {
            const ok = onCopy(v);
            setError(ok ? null : '정답과 똑같이 입력해 주세요.');
            return ok;
          }}
        />
      )}
    </>
  );
}
