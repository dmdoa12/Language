import { getRelic } from '../../core/relics';
import type { RewardOption } from '../../core/run';
import { useGameStore } from '../../store/game';
import { RunHud } from '../components/RunHud';

function label(option: RewardOption): { title: string; detail: string } {
  switch (option.kind) {
    case 'gold':
      return { title: `골드 +${option.amount}`, detail: '맞힌 만큼 받는 골드' };
    case 'heal':
      return { title: `체력 +${option.amount}`, detail: '지금 바로 회복' };
    case 'relic': {
      const relic = getRelic(option.relicId)!;
      return { title: `유물: ${relic.name}`, detail: relic.description };
    }
  }
}

export function Reward() {
  const run = useGameStore((s) => s.run)!;
  const reward = useGameStore((s) => s.reward)!;
  const choose = useGameStore((s) => s.chooseReward);

  return (
    <div className="screen reward">
      <RunHud run={run} />
      <h2>노드 클리어</h2>
      {reward.notes.map((n) => (
        <p key={n} className="note">
          {n}
        </p>
      ))}
      {reward.options.length > 0 ? (
        <>
          <p className="muted">하나를 골라요.</p>
          <ul className="offer-list">
            {reward.options.map((o) => {
              const { title, detail } = label(o);
              return (
                <li key={title}>
                  <button type="button" className="offer" onClick={() => void choose(o)}>
                    <span className="offer-ko">{title}</span>
                    <span className="offer-situation">{detail}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <button type="button" className={reward.options.length > 0 ? 'secondary' : 'primary'} onClick={() => void choose(null)}>
        {reward.options.length > 0 ? '받지 않고 넘어가기' : '계속'}
      </button>
    </div>
  );
}
