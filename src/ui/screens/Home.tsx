import { seoulDateKey } from '../../core/date';
import { selectDueCards, selectNewCards } from '../../core/fsrs';
import { useCardsStore } from '../../store/cards';
import { activeRun, useGameStore } from '../../store/game';
import { useReviewStore } from '../../store/review';

export function Home() {
  const cards = useCardsStore((s) => s.cards);
  const profile = useCardsStore((s) => s.profile);
  const runs = useCardsStore((s) => s.runs);
  const startRun = useGameStore((s) => s.startRun);
  const resumeRun = useGameStore((s) => s.resumeRun);
  const openReview = useGameStore((s) => s.openReview);
  const startReview = useReviewStore((s) => s.start);

  const now = new Date();
  const today = seoulDateKey(now);
  const dueCount = selectDueCards(cards, now).length;
  const newAvailable = selectNewCards(cards, profile.unlockedThemes, profile.dailyNewLimit, now).length;
  const learned = cards.filter((c) => c.introducedAt !== null).length;
  const running = activeRun(runs);
  const practiceNext = runs.some((r) => r.date === today);

  return (
    <div className="screen home">
      <h1>일본어 회화 로그라이크</h1>
      <dl className="summary">
        <div>
          <dt>오늘 복습</dt>
          <dd>{dueCount}</dd>
        </div>
        <div>
          <dt>새 표현 한도</dt>
          <dd>{newAvailable}</dd>
        </div>
        <div>
          <dt>배운 표현</dt>
          <dd>{learned}</dd>
        </div>
      </dl>
      {running ? (
        <button type="button" className="primary" onClick={resumeRun}>
          런 이어하기
        </button>
      ) : (
        <button type="button" className="primary" onClick={() => void startRun()}>
          {practiceNext ? '연습 런 시작 (보상 절반)' : '오늘의 런 시작'}
        </button>
      )}
      <p className="muted small">
        오늘 복습할 표현은 어느 길로 가도 전부 나와요. 새 표현은 중간 상점에서 골라 배워요.
      </p>
      {dueCount > 0 && !running ? (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            openReview();
            startReview();
          }}
        >
          맵 없이 빠른 복습
        </button>
      ) : null}
    </div>
  );
}
