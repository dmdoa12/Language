import { useReviewStore } from '../../store/review';

export function Home() {
  const today = useReviewStore((s) => s.today);
  const startSession = useReviewStore((s) => s.startSession);
  const nothing = today.dueCount === 0 && today.newAvailable === 0;

  return (
    <div className="screen home">
      <h1>일본어 회화 연습</h1>
      <dl className="summary">
        <div>
          <dt>오늘 복습</dt>
          <dd>{today.dueCount}</dd>
        </div>
        <div>
          <dt>새 표현</dt>
          <dd>{today.newAvailable}</dd>
        </div>
      </dl>
      <button type="button" className="primary" disabled={nothing} onClick={startSession}>
        {nothing ? '오늘은 끝났어요' : '시작하기'}
      </button>
    </div>
  );
}
