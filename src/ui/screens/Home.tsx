import { seoulDateKey } from '../../core/date';
import { selectDueCards, selectNewCards } from '../../core/fsrs';
import { characterLevel } from '../../core/meta';
import { getRelic } from '../../core/relics';
import { useCardsStore } from '../../store/cards';
import { activeRun, useGameStore } from '../../store/game';
import { useReviewStore } from '../../store/review';
import { THEME_LABELS } from '../labels';

export function Home() {
  const cards = useCardsStore((s) => s.cards);
  const profile = useCardsStore((s) => s.profile);
  const runs = useCardsStore((s) => s.runs);
  const startRun = useGameStore((s) => s.startRun);
  const resumeRun = useGameStore((s) => s.resumeRun);
  const openReview = useGameStore((s) => s.openReview);
  const startReview = useReviewStore((s) => s.start);
  const open = useGameStore((s) => s.open);
  const notices = useCardsStore((s) => s.notices);
  const dismissNotices = useCardsStore((s) => s.dismissNotices);

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
      <p className="home-meta">
        레벨 <strong>{characterLevel(cards)}</strong> · 연속 <strong>{profile.streak}</strong>일 · 휴식권{' '}
        {profile.restTokens}
      </p>
      {notices.length > 0 ? (
        <section className="notice" role="status">
          {notices.map((n) => (
            <p key={n.kind === 'theme' ? n.theme : n.relicId}>
              {n.kind === 'theme'
                ? `새 테마 해금: ${THEME_LABELS[n.theme]}`
                : `희귀 유물 획득: ${getRelic(n.relicId)?.name ?? n.relicId} (매 런 시작 때 장착)`}
            </p>
          ))}
          <button type="button" className="link" onClick={dismissNotices}>
            확인
          </button>
        </section>
      ) : null}
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
      <nav className="home-nav">
        <button type="button" className="secondary" onClick={() => open('mining')}>
          수집함
        </button>
        <button type="button" className="secondary" onClick={() => open('collection')}>
          도감
        </button>
        <button type="button" className="secondary" onClick={() => open('settings')}>
          설정
        </button>
      </nav>
    </div>
  );
}
