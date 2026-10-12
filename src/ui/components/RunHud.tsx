import { useState } from 'react';
import { getRelic } from '../../core/relics';
import type { Run } from '../../core/types';

export function RunHud({ run, onAbandon }: { run: Run; onAbandon?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const relics = run.relicIds.map((id) => getRelic(id)).filter((r) => r !== undefined);
  return (
    <header className="hud">
      <div className="hud-row">
        <span className="hud-stat">
          체력 <strong>{run.hp}</strong>/{run.maxHp}
        </span>
        <span className="hud-stat">
          골드 <strong>{run.gold}</strong>
        </span>
        {run.practice ? <span className="chip">연습 모드</span> : null}
        {onAbandon ? (
          confirming ? (
            <span className="hud-confirm">
              <button type="button" className="link danger" onClick={onAbandon}>
                포기하기
              </button>
              <button type="button" className="link" onClick={() => setConfirming(false)}>
                취소
              </button>
            </span>
          ) : (
            <button type="button" className="link" onClick={() => setConfirming(true)}>
              그만두기
            </button>
          )
        ) : null}
      </div>
      {relics.length > 0 ? (
        <ul className="relics">
          {relics.map((r) => (
            <li key={r.id} title={r.description}>
              {r.name}
              {run.consumedRelicIds.includes(r.id) ? ' (사용함)' : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
