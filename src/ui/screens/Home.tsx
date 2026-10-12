import { seoulDateKey } from '../../core/date';
import { totalLines } from '../../core/day';
import { planDay } from '../../core/dayplan';
import { selectDueCards, selectNewCards } from '../../core/fsrs';
import { characterLevel } from '../../core/meta';
import { THEME_ORDER } from '../../core/types';
import { useCardsStore } from '../../store/cards';
import { useDayStore } from '../../store/day';
import { useReviewStore } from '../../store/review';
import { THEME_LABELS } from '../labels';

export function Home() {
  const cards = useCardsStore((s) => s.cards);
  const profile = useCardsStore((s) => s.profile);
  const days = useCardsStore((s) => s.days);
  const notices = useCardsStore((s) => s.notices);
  const dismissNotices = useCardsStore((s) => s.dismissNotices);
  const startOrResume = useDayStore((s) => s.startOrResumeDay);
  const open = useDayStore((s) => s.open);
  const startReview = useReviewStore((s) => s.start);

  const now = new Date();
  const today = days.find((d) => d.date === seoulDateKey(now)) ?? null;
  const due = selectDueCards(cards, now);
  const fresh = selectNewCards(cards, profile.unlockedThemes, profile.dailyNewLimit, now);
  const preview = planDay({ due, fresh });
  const places = [...new Set(preview.map((s) => s.theme))].sort((a, b) => THEME_ORDER.indexOf(a) - THEME_ORDER.indexOf(b));
  const dueNow = selectDueCards(cards, now, 0).length;

  return (
    <div className="screen home">
      <h1>일본에서의 하루</h1>
      <p className="home-meta">
        레벨 <strong>{characterLevel(cards)}</strong> · 연속 <strong>{profile.streak}</strong>일 · 휴식권{' '}
        {profile.restTokens}
      </p>

      {notices.length > 0 ? (
        <section className="notice" role="status">
          {notices.map((n) => (
            <p key={n.theme}>새 장소에 갈 수 있어요: {THEME_LABELS[n.theme]}</p>
          ))}
          <button type="button" className="link" onClick={dismissNotices}>
            확인
          </button>
        </section>
      ) : null}

      {today === null ? (
        <section className="panel today">
          <h2>오늘의 하루</h2>
          {preview.length === 0 ? (
            <p className="muted">오늘은 복습할 표현도 새 표현도 없어요.</p>
          ) : (
            <>
              <p className="today-route">{places.map((t) => THEME_LABELS[t]).join(' → ')}</p>
              <p className="muted small tabular">
                장면 {preview.length}개 · 복습 {due.length} · 새 표현 {fresh.length}
              </p>
            </>
          )}
          <button type="button" className="primary" onClick={() => void startOrResume()} disabled={preview.length === 0}>
            하루 시작
          </button>
        </section>
      ) : today.status === 'active' ? (
        <section className="panel today">
          <h2>오늘의 하루</h2>
          <p className="muted small tabular">
            {today.results.length}/{totalLines(today)}마디 진행
          </p>
          <button type="button" className="primary" onClick={() => void startOrResume()}>
            이어서 하기
          </button>
        </section>
      ) : (
        <section className="panel today">
          <h2>오늘 하루 완료</h2>
          <p className="muted small">내일 다시 새로운 하루가 열려요.</p>
          <button type="button" className="secondary" onClick={() => open('summary')}>
            오늘 요약 보기
          </button>
        </section>
      )}

      {today?.status === 'done' && dueNow > 0 ? (
        <button
          type="button"
          className="primary"
          onClick={() => {
            open('review');
            startReview();
          }}
        >
          잊기 전에 한 번 더 ({dueNow})
        </button>
      ) : null}

      <nav className="home-nav">
        <button type="button" className="secondary" onClick={() => open('garden')}>
          정원
        </button>
        <button type="button" className="secondary" onClick={() => open('mining')}>
          수집함
        </button>
        <button type="button" className="secondary" onClick={() => open('settings')}>
          설정
        </button>
      </nav>
    </div>
  );
}
