import { currentPosition, positionAt, totalLines } from '../../core/day';
import { getCard } from '../../store/cards';
import { useDayStore } from '../../store/day';
import { CardQuestion, CardResult, CardStudy } from '../components/CardViews';
import { MISHEARD_REPLY, THEME_LABELS, THEME_SCENES } from '../labels';

export function DayScreen() {
  const s = useDayStore();
  const day = s.day!;
  const line = s.line!;
  // 결과 화면에서는 방금 답한 줄이 이미 기록됐으므로 그 위치를 보여준다
  const pos = line.phase === 'result' ? positionAt(day, day.results.length - 1) : currentPosition(day);
  if (!pos) return null;
  const { scene } = pos;
  const place = THEME_SCENES[scene.theme];
  const card = getCard(line.cardId);
  const done = line.phase === 'result' ? day.results.length : day.results.length;
  const total = totalLines(day);
  const sceneLabel = `${place.time} · ${THEME_LABELS[scene.theme]}${scene.parts > 1 ? ` ${scene.part}/${scene.parts}` : ''}`;

  return (
    <div className="screen day">
      <header className="progress">
        <span>
          {sceneLabel} · {Math.min(done + (line.phase === 'result' ? 0 : 1), total)}/{total}
        </span>
        <button type="button" className="link" onClick={s.goHome}>
          잠시 쉬기
        </button>
      </header>
      <div className="day-progress" aria-hidden="true">
        <span style={{ width: `${(done / total) * 100}%` }} />
      </div>

      {line.phase === 'intro' ? (
        <section className="scene-intro">
          <p className="scene-time">{place.time}</p>
          <h2>{THEME_LABELS[scene.theme]}</h2>
          <p>{place.intro}</p>
          <p className="muted small">
            이 장면에서 말할 표현 {scene.lines.length}개
            {scene.lines.some((l) => l.isNew) ? ` · 새 표현 ${scene.lines.filter((l) => l.isNew).length}개` : ''}
          </p>
          <button type="button" className="primary" onClick={s.beginScene} autoFocus>
            들어가기
          </button>
        </section>
      ) : null}

      {line.phase === 'study' ? <CardStudy card={card} onDone={s.finishStudy} /> : null}

      {line.phase === 'question' ? (
        <CardQuestion
          card={card}
          hintUsed={line.hintUsed}
          onHint={s.revealHint}
          onSubmit={s.submitAnswer}
          busy={s.busy}
          badge={
            <>
              {place.partner} 앞에서{line.isNew ? ' · 방금 배운 표현' : ''}
            </>
          }
        />
      ) : null}

      {line.phase === 'result' && line.lastGrade ? (
        <CardResult
          card={card}
          grade={line.lastGrade}
          lastInput={line.lastInput}
          copied={line.copied}
          onCopy={s.submitCopy}
          onNext={s.continueAfterResult}
          verdict={line.verdict}
          extra={
            <>
              {line.lastGrade.result !== 'correct' ? (
                <p className="reply">
                  {place.partner}: <span lang="ja">「{MISHEARD_REPLY}」</span>
                </p>
              ) : null}
              {!line.recorded ? <p className="muted small">오늘 이미 복습한 표현이라 복습 기록에는 반영하지 않았어요.</p> : null}
            </>
          }
        />
      ) : null}
    </div>
  );
}
