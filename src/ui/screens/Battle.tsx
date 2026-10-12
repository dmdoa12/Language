import { currentNode, isScheduledCard, remainingCardIds } from '../../core/run';
import { getCard } from '../../store/cards';
import { useGameStore } from '../../store/game';
import { CardQuestion, CardResult, CardStudy } from '../components/CardViews';
import { RunHud } from '../components/RunHud';
import { NODE_LABELS, THEME_LABELS } from '../labels';

export function Battle() {
  const g = useGameStore();
  const run = g.run!;
  const battle = g.battle!;
  const card = getCard(battle.cardId);
  const node = currentNode(run);

  const learn = battle.mode === 'learn';
  const practiceCard = !learn && node !== null && !isScheduledCard(node, card.id);
  const total = node ? node.cardIds.length + node.extraCardIds.length : 0;
  const done = node ? total - remainingCardIds(node).length : 0;

  // 판정 화면에서는 방금 푼 카드가 이미 answered 에 들어가 있다.
  const index = battle.phase === 'result' ? done : done + 1;
  const title = learn ? '새 표현 학습' : node ? `${NODE_LABELS[node.type]} ${Math.min(index, total)}/${total}` : '';
  const badge = (
    <>
      {THEME_LABELS[card.theme]}
      {practiceCard ? ' · 연습 출제 (복습 기록 안 함)' : ''}
      {node?.type === 'boss' && !learn ? ' · 오답 시 체력 -2' : ''}
    </>
  );

  let damageNote = null;
  if (battle.phase === 'result' && !learn) {
    if (battle.negatedBy) damageNote = <p className="note">부적이 피해를 막았어요.</p>;
    else if (battle.damage > 0) damageNote = <p className="note danger">체력 -{battle.damage}</p>;
    if (run.status === 'dead') damageNote = <p className="note danger">체력이 다했어요. 학습 기록은 그대로 남아요.</p>;
  }
  const resultExtra = (
    <>
      {damageNote}
      {battle.phase === 'result' && !battle.recorded && !learn ? (
        <p className="muted small">연습 출제라 복습 기록에는 반영되지 않았어요.</p>
      ) : null}
    </>
  );

  return (
    <div className="screen battle">
      <RunHud run={run} />
      <p className="battle-title">{title}</p>
      {battle.phase === 'study' ? <CardStudy card={card} onDone={g.finishStudy} /> : null}
      {battle.phase === 'question' ? (
        <CardQuestion
          card={card}
          hintUsed={battle.hintUsed}
          onHint={g.revealHint}
          onSubmit={g.submitAnswer}
          badge={badge}
          busy={g.busy}
        />
      ) : null}
      {battle.phase === 'result' && battle.lastGrade ? (
        <CardResult
          card={card}
          grade={battle.lastGrade}
          lastInput={battle.lastInput}
          copied={battle.copied}
          onCopy={g.submitCopy}
          onNext={() => void g.continueAfterResult()}
          extra={resultExtra}
          verdict={battle.verdict}
        />
      ) : null}
    </div>
  );
}
