import { seoulDateKey } from '../../core/date';
import { characterLevel } from '../../core/meta';
import { countDueBy } from '../../core/session';
import { useCardsStore } from '../../store/cards';
import { useGameStore } from '../../store/game';

const STATUS_LABEL = {
  won: '보스 격파',
  dead: '쓰러졌어요',
  abandoned: '런 포기',
  active: '진행 중',
} as const;

export function RunResult() {
  const run = useGameStore((s) => s.run)!;
  const goHome = useGameStore((s) => s.goHome);
  const startLevel = useGameStore((s) => s.startLevel);
  const cards = useCardsStore((s) => s.cards);
  const tomorrow = seoulDateKey(Date.now() + 24 * 60 * 60 * 1000);
  const answered = run.stats.good + run.stats.hard + run.stats.again;
  const level = characterLevel(cards);

  return (
    <div className="screen result">
      <h2>{STATUS_LABEL[run.status]}</h2>
      {run.status === 'dead' ? (
        <p className="muted">이미 답한 표현의 학습 기록은 그대로 저장됐어요. 못 푼 표현은 복습 대상으로 남아요.</p>
      ) : null}
      <dl className="summary">
        <div>
          <dt>맞힌 수</dt>
          <dd>
            {run.stats.good + run.stats.hard}/{answered}
          </dd>
        </div>
        <div>
          <dt>골드</dt>
          <dd>{run.gold}</dd>
        </div>
        <div>
          <dt>레벨</dt>
          <dd>{startLevel !== null && startLevel !== level ? `${startLevel}→${level}` : level}</dd>
        </div>
        <div>
          <dt>내일까지 복습</dt>
          <dd>{countDueBy(cards, tomorrow)}</dd>
        </div>
      </dl>
      <p className="muted small">
        정답 {run.stats.good} · 애매 {run.stats.hard} · 오답 {run.stats.again}
        {run.practice ? ' · 연습 모드' : ''}
      </p>
      <button type="button" className="primary" onClick={goHome}>
        처음으로
      </button>
    </div>
  );
}
