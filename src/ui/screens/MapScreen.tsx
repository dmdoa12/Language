import { useEffect, useRef } from 'react';
import { availableNodeIds } from '../../core/run';
import type { MapNode } from '../../core/types';
import { useGameStore } from '../../store/game';
import { RunHud } from '../components/RunHud';
import { NODE_LABELS, THEME_LABELS } from '../labels';

const ROW = 84;

function layout(nodes: readonly MapNode[]) {
  const floors = new Map<number, MapNode[]>();
  for (const n of nodes) floors.set(n.floor, [...(floors.get(n.floor) ?? []), n]);
  const pos = new Map<string, { x: number; y: number }>();
  for (const [floor, list] of floors) {
    list.forEach((n, i) => pos.set(n.id, { x: ((i + 0.5) / list.length) * 100, y: floor * ROW + ROW / 2 }));
  }
  return { pos, height: floors.size * ROW };
}

export function MapScreen() {
  const run = useGameStore((s) => s.run)!;
  const chooseNode = useGameStore((s) => s.chooseNode);
  const abandon = useGameStore((s) => s.abandon);
  const available = new Set(availableNodeIds(run));
  const { pos, height } = layout(run.nodes);
  const firstAvailable = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    firstAvailable.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [run.currentNodeId]);

  const focusId = run.nodes.find((n) => available.has(n.id))?.id;
  return (
    <div className="screen map">
      <RunHud run={run} onAbandon={() => void abandon()} />
      <p className="muted small">
        같은 층의 노드는 같은 표현이 나와요. 보정만 달라요.
        {run.mainTheme ? ` 보스 테마: ${THEME_LABELS[run.mainTheme]}` : ''}
      </p>
      <div className="map-board" style={{ height }}>
        <svg className="map-lines" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          {run.nodes.flatMap((n) =>
            n.next.map((to) => {
              const a = pos.get(n.id)!;
              const b = pos.get(to)!;
              const lit = n.id === run.currentNodeId && available.has(to);
              return (
                <line
                  key={`${n.id}-${to}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={lit ? 'lit' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }),
          )}
        </svg>
        {run.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const isAvailable = available.has(n.id);
          const state = n.id === run.currentNodeId ? 'current' : n.cleared ? 'cleared' : isAvailable ? 'available' : 'locked';
          const count = n.cardIds.length + n.extraCardIds.length;
          return (
            <button
              key={n.id}
              ref={n.id === focusId ? firstAvailable : undefined}
              type="button"
              className={`map-node node-${n.type} state-${state}`}
              style={{ left: `${p.x}%`, top: p.y }}
              disabled={!isAvailable}
              onClick={() => void chooseNode(n.id)}
            >
              <span className="node-label">{NODE_LABELS[n.type]}</span>
              {n.type !== 'shop' ? <span className="node-count">{count}장</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
