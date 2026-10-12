import type { PlantStage } from '../../core/garden';

interface Props {
  stage: PlantStage;
  wilted: boolean;
  special?: boolean; // 수집함에서 만든 표현: 별 모양 꽃
  size?: number;
}

// 단계(씨앗·새싹·잎·꽃)와 생기로 그린 식물. 색은 CSS 토큰을 따른다.
export function PlantIcon({ stage, wilted, special = false, size = 56 }: Props) {
  const leaf = wilted ? 'var(--wilt)' : 'var(--leaf)';
  const leafLight = wilted ? 'var(--wilt)' : 'var(--leaf-light)';
  const droop = wilted ? 18 : 0;
  const h = [6, 16, 28, 36][stage]!;
  const top = 56 - h;
  const bend = wilted ? 10 : 0;

  const leafAt = (y: number, side: 1 | -1, r: number, key: string) => (
    <ellipse
      key={key}
      cx={28 + side * r * 0.9}
      cy={y}
      rx={r}
      ry={r * 0.45}
      fill={side > 0 ? leaf : leafLight}
      transform={`rotate(${side * (35 + droop)} 28 ${y})`}
    />
  );

  let flower = null;
  if (stage === 3) {
    const cx = 28 + bend;
    const cy = top + (wilted ? 8 : 0);
    const petal = wilted ? 'var(--wilt)' : special ? 'var(--flower-special)' : 'var(--flower)';
    const count = special ? 5 : 6;
    flower = (
      <g>
        {Array.from({ length: count }, (_, i) => {
          const a = (i * 2 * Math.PI) / count - Math.PI / 2;
          const px = cx + Math.cos(a) * 5;
          const py = cy + Math.sin(a) * 5;
          return special ? (
            <path
              key={i}
              d={`M${cx} ${cy} L${(cx + Math.cos(a - 0.35) * 4).toFixed(1)} ${(cy + Math.sin(a - 0.35) * 4).toFixed(1)} L${(cx + Math.cos(a) * 8).toFixed(1)} ${(cy + Math.sin(a) * 8).toFixed(1)} L${(cx + Math.cos(a + 0.35) * 4).toFixed(1)} ${(cy + Math.sin(a + 0.35) * 4).toFixed(1)} Z`}
              fill={petal}
            />
          ) : (
            <ellipse
              key={i}
              cx={px.toFixed(1)}
              cy={py.toFixed(1)}
              rx={4}
              ry={3}
              fill={petal}
              transform={`rotate(${(i * 360) / count} ${px.toFixed(1)} ${py.toFixed(1)})`}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={3.2} fill="var(--flower-core)" />
      </g>
    );
  }

  return (
    <svg viewBox="0 0 56 64" width={size} height={(size * 64) / 56} aria-hidden="true" className="plant-svg">
      <ellipse cx="28" cy="58" rx="20" ry="5" fill="var(--soil)" />
      <ellipse cx="28" cy="57" rx="14" ry="3" fill="var(--soil-dark)" />
      {stage === 0 ? (
        <>
          <ellipse cx="28" cy="54" rx="4" ry="3" fill="var(--soil-dark)" />
          <path d="M28 52 q2 -4 5 -4" stroke={leafLight} strokeWidth="2" fill="none" strokeLinecap="round" />
          {special ? <circle cx="34" cy="47" r="2" fill="var(--flower-special)" /> : null}
        </>
      ) : (
        <g className={wilted ? undefined : 'sway'}>
          <path
            d={`M28 56 Q${28 + bend * 0.6} ${56 - h / 2} ${28 + bend} ${top + (wilted ? 6 : 0)}`}
            stroke={leaf}
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          {leafAt(52 - h * 0.35, -1, stage >= 2 ? 7 : 5, 'a')}
          {leafAt(52 - h * 0.35, 1, stage >= 2 ? 7 : 5, 'b')}
          {stage >= 2 ? [leafAt(52 - h * 0.7, -1, 6, 'c'), leafAt(52 - h * 0.7, 1, 6, 'd')] : null}
          {flower}
        </g>
      )}
    </svg>
  );
}
