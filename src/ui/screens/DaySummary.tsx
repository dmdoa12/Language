import { isLlmEnabled } from '../../api/llm';
import { seoulDateKey } from '../../core/date';
import { grownCardIds, summarizeDay } from '../../core/day';
import { plantOf, plantStage, STAGE_LABELS } from '../../core/garden';
import { characterLevel } from '../../core/meta';
import { countDueBy } from '../../core/session';
import { useCardsStore } from '../../store/cards';
import { useDayStore } from '../../store/day';
import { PlantIcon } from '../components/PlantIcon';

export function DaySummary() {
  const day = useDayStore((s) => s.day);
  const startLevel = useDayStore((s) => s.startLevel);
  const goHome = useDayStore((s) => s.goHome);
  const open = useDayStore((s) => s.open);
  const startChat = useDayStore((s) => s.startChat);
  const cards = useCardsStore((s) => s.cards);
  if (!day) return null;

  const now = new Date();
  const sum = summarizeDay(day);
  const level = characterLevel(cards);
  const tomorrow = seoulDateKey(Date.now() + 24 * 3600 * 1000);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const grown = grownCardIds(day, (id) => {
    const c = byId.get(id);
    return c && c.introducedAt !== null ? plantStage(c.fsrs.stability) : null;
  });
  const canChat = day.scenes.length > 0 && !day.eveningChatDone && isLlmEnabled();

  return (
    <div className="screen summary-screen">
      <h2>{day.scenes.length === 0 ? '오늘은 할 일이 없어요' : '오늘 하루 끝'}</h2>
      {day.scenes.length > 0 ? (
        <dl className="summary">
          <div>
            <dt>한 번에 말함</dt>
            <dd>
              {sum.good}/{sum.answered}
            </dd>
          </div>
          <div>
            <dt>새 표현</dt>
            <dd>{sum.learnedNew}</dd>
          </div>
          <div>
            <dt>레벨</dt>
            <dd>{startLevel !== null && startLevel !== level ? `${startLevel}→${level}` : level}</dd>
          </div>
          <div>
            <dt>내일 복습</dt>
            <dd>{countDueBy(cards, tomorrow)}</dd>
          </div>
        </dl>
      ) : (
        <p className="muted">복습할 표현도 새로 배울 표현도 없어요. 수집함에 표현을 모아 두면 다음 날 나와요.</p>
      )}

      {grown.length > 0 ? (
        <section className="panel">
          <h3>오늘 자란 식물 {grown.length}</h3>
          <ul className="grown-list">
            {grown.map((id) => {
              const card = byId.get(id)!;
              const plant = plantOf(card, now)!;
              return (
                <li key={id}>
                  <PlantIcon stage={plant.stage} wilted={plant.wilted} special={plant.special} size={36} />
                  <span>
                    <span className="grown-ko">{card.ko}</span>
                    <span className="muted small"> {STAGE_LABELS[plant.stage]}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {canChat ? (
        <button type="button" className="primary" onClick={() => void startChat()}>
          하루 마무리 대화
        </button>
      ) : null}
      <button type="button" className={canChat ? 'secondary' : 'primary'} onClick={() => open('garden')}>
        정원 보기
      </button>
      <button type="button" className="secondary" onClick={goHome}>
        처음으로
      </button>
    </div>
  );
}
