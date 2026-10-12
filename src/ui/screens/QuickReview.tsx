import { useDayStore } from '../../store/day';
import { useReviewStore } from '../../store/review';
import { CardQuestion, CardResult } from '../components/CardViews';

export function QuickReview() {
  const s = useReviewStore();
  const goHome = useDayStore((g) => g.goHome);
  const leave = () => {
    s.stop();
    goHome();
  };

  return (
    <div className="screen review">
      <header className="progress">
        <span>빠른 복습 {s.stats.reviewed}</span>
        <button type="button" className="link" onClick={leave}>
          그만하기
        </button>
      </header>
      {s.phase === 'question' && s.current ? (
        <CardQuestion
          card={s.current}
          hintUsed={s.hintUsed}
          onHint={s.revealHint}
          onSubmit={s.submitAnswer}
          busy={s.judging}
        />
      ) : null}
      {s.phase === 'result' && s.current && s.lastGrade ? (
        <CardResult
          card={s.current}
          grade={s.lastGrade}
          lastInput={s.lastInput}
          copied={s.copied}
          onCopy={s.submitCopy}
          onNext={s.next}
          verdict={s.verdict}
        />
      ) : null}
      {s.phase === 'done' ? (
        <>
          <h2>지금 복습할 표현을 다 풀었어요</h2>
          <p className="muted">
            정답 {s.stats.good} · 애매 {s.stats.hard} · 오답 {s.stats.again}
          </p>
          {s.nextDueAt !== null ? (
            <p className="muted">
              다음 복습: {new Date(s.nextDueAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
            </p>
          ) : null}
          <button type="button" className="primary" onClick={leave}>
            처음으로
          </button>
        </>
      ) : null}
    </div>
  );
}
