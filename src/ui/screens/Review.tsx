import { useEffect, useState } from 'react';
import { buildHint } from '../../core/session';
import { THEME_LABELS } from '../labels';
import { useReviewStore } from '../../store/review';
import { AnswerPanel } from '../components/AnswerPanel';
import { JaInput } from '../components/JaInput';
import { speak } from '../tts';

const RESULT_LABEL = {
  correct: '정답',
  near: '아까워요 (근접 오답)',
  wrong: '오답',
} as const;

function Progress() {
  const stats = useReviewStore((s) => s.stats);
  const goHome = useReviewStore((s) => s.goHome);
  return (
    <header className="progress">
      <span>
        복습 {stats.reviewed} · 새 표현 {stats.introduced}
      </span>
      <button type="button" className="link" onClick={goHome}>
        그만하기
      </button>
    </header>
  );
}

function Study() {
  const card = useReviewStore((s) => s.current)!;
  const finishStudy = useReviewStore((s) => s.finishStudy);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => speak(card.ja), [card.id, card.ja]);

  return (
    <>
      <p className="badge">새 표현 · {THEME_LABELS[card.theme]}</p>
      <p className="situation">{card.situation}</p>
      <AnswerPanel card={card} />
      <JaInput
        key={card.id}
        placeholder="위 문장을 그대로 입력"
        submitLabel="외웠어요"
        error={error}
        onSubmit={async (v) => {
          const ok = await finishStudy(v);
          setError(ok ? null : '문장과 똑같이 입력해 주세요.');
          return ok;
        }}
      />
    </>
  );
}

function Question() {
  const card = useReviewStore((s) => s.current)!;
  const hintUsed = useReviewStore((s) => s.hintUsed);
  const revealHint = useReviewStore((s) => s.revealHint);
  const submitAnswer = useReviewStore((s) => s.submitAnswer);

  return (
    <>
      <p className="badge">{THEME_LABELS[card.theme]}</p>
      <p className="situation">{card.situation}</p>
      <p className="prompt-ko">{card.ko}</p>
      {hintUsed ? (
        <p className="hint" lang="ja">
          {buildHint(card)}
        </p>
      ) : (
        <button type="button" className="link" onClick={revealHint}>
          힌트 보기 (등급이 낮아져요)
        </button>
      )}
      <JaInput key={card.id} placeholder="일본어로 말해 보세요" submitLabel="확인" onSubmit={submitAnswer} />
    </>
  );
}

function Result() {
  const card = useReviewStore((s) => s.current)!;
  const grade = useReviewStore((s) => s.lastGrade)!;
  const lastInput = useReviewStore((s) => s.lastInput);
  const copied = useReviewStore((s) => s.copied);
  const submitCopy = useReviewStore((s) => s.submitCopy);
  const next = useReviewStore((s) => s.next);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => speak(card.ja), [card.id, card.ja]);

  return (
    <>
      <p className={`verdict verdict-${grade.result}`}>{RESULT_LABEL[grade.result]}</p>
      <p className="your-input">
        내 답: <span lang="ja">{lastInput}</span>
      </p>
      <AnswerPanel card={card} />
      {copied ? (
        <button type="button" className="primary" onClick={next} autoFocus>
          다음
        </button>
      ) : (
        <JaInput
          key={`copy-${card.id}`}
          placeholder="정답을 한 번 따라 입력"
          submitLabel="따라 입력 완료"
          error={error}
          onSubmit={(v) => {
            const ok = submitCopy(v);
            setError(ok ? null : '정답과 똑같이 입력해 주세요.');
            return ok;
          }}
        />
      )}
    </>
  );
}

function Done() {
  const stats = useReviewStore((s) => s.stats);
  const nextDueAt = useReviewStore((s) => s.nextDueAt);
  const goHome = useReviewStore((s) => s.goHome);
  return (
    <>
      <h2>오늘 분량 끝</h2>
      <dl className="summary">
        <div>
          <dt>복습</dt>
          <dd>{stats.reviewed}</dd>
        </div>
        <div>
          <dt>정답</dt>
          <dd>{stats.good}</dd>
        </div>
        <div>
          <dt>애매</dt>
          <dd>{stats.hard}</dd>
        </div>
        <div>
          <dt>오답</dt>
          <dd>{stats.again}</dd>
        </div>
      </dl>
      {nextDueAt !== null ? (
        <p className="muted">다음 복습: {new Date(nextDueAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
      ) : null}
      <button type="button" className="primary" onClick={goHome}>
        처음으로
      </button>
    </>
  );
}

export function Review() {
  const phase = useReviewStore((s) => s.phase);
  return (
    <div className="screen review">
      {phase !== 'done' ? <Progress /> : null}
      {phase === 'study' ? <Study /> : null}
      {phase === 'question' ? <Question /> : null}
      {phase === 'result' ? <Result /> : null}
      {phase === 'done' ? <Done /> : null}
    </div>
  );
}
