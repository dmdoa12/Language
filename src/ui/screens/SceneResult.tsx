import { currentPosition, sceneResult } from '../../core/day';
import { useDayStore } from '../../store/day';
import { THEME_LABELS, THEME_SCENES } from '../labels';

export function SceneResult() {
  const day = useDayStore((s) => s.day)!;
  const index = useDayStore((s) => s.lastSceneIndex)!;
  const next = useDayStore((s) => s.continueAfterScene);
  const scene = day.scenes[index]!;
  const r = sceneResult(day, index);
  const pct = Math.round(r.smoothness * 100);
  const upcoming = currentPosition(day);

  return (
    <div className="screen scene-result">
      <p className="scene-time">
        {THEME_SCENES[scene.theme].time} · {THEME_LABELS[scene.theme]}
        {scene.parts > 1 ? ` ${scene.part}/${scene.parts}` : ''}
      </p>
      <h2>장면 끝</h2>
      <section className="panel">
        <p className="big tabular">매끄러움 {pct}%</p>
        <div className="meter" role="img" aria-label={`한 번에 말한 비율 ${pct}%`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small">
          {r.total}마디 중 {r.firstTry}마디를 한 번에 말했어요.
        </p>
      </section>
      <button type="button" className="primary" onClick={next} autoFocus>
        {upcoming === null
          ? '하루 마무리'
          : upcoming.scene.theme === scene.theme
            ? `계속: ${THEME_LABELS[upcoming.scene.theme]} ${upcoming.scene.part}/${upcoming.scene.parts}`
            : `다음 장소: ${THEME_LABELS[upcoming.scene.theme]}`}
      </button>
    </div>
  );
}
