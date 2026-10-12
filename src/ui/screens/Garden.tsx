import { useState } from 'react';
import { characterLevel, levelProgress, themeStableRatio, UNLOCK_RATIO, UNLOCK_STABILITY } from '../../core/meta';
import { gardenStats, plantOf, STAGE_LABELS, type Plant } from '../../core/garden';
import { THEME_ORDER, type StudyCard } from '../../core/types';
import { useCardsStore } from '../../store/cards';
import { useDayStore } from '../../store/day';
import { PlantIcon } from '../components/PlantIcon';
import { SentenceStructure } from '../components/SentenceStructure';
import { THEME_LABELS } from '../labels';
import { isTtsSupported, speak } from '../tts';

function dueText(dueAt: number, now: number): string {
  const days = Math.round((dueAt - now) / (24 * 3600 * 1000));
  if (dueAt <= now) return days < 0 ? `복습 ${-days}일 지남` : '지금 복습할 때';
  return days === 0 ? '오늘 복습' : `${days}일 뒤 복습`;
}

function Detail({ card, plant }: { card: StudyCard; plant: Plant }) {
  const now = Date.now();
  const state = plant.wilted ? '시들었어요 - 복습하면 다시 살아나요' : STAGE_LABELS[plant.stage];
  return (
    <section className="panel plant-detail" aria-live="polite">
      <SentenceStructure text={card.ja} grammarTags={card.grammarTags} />
      <p>{card.ko}</p>
      <p className="muted small">{card.situation}</p>
      <p className="note">
        {state}
        {plant.special ? ' · 내가 모은 표현' : ''}
      </p>
      <p className="muted small tabular">
        기억 유지 {plant.stability < 1 ? '1일 미만' : `${Math.round(plant.stability)}일`} · 지금 기억할 확률{' '}
        {Math.round(plant.retrievability * 100)}% · {dueText(plant.dueAt, now)}
      </p>
      {isTtsSupported() ? (
        <button type="button" className="secondary" onClick={() => speak(card.ja)}>
          듣기
        </button>
      ) : null}
    </section>
  );
}

export function Garden() {
  const cards = useCardsStore((s) => s.cards);
  const profile = useCardsStore((s) => s.profile);
  const goHome = useDayStore((s) => s.goHome);
  const [selected, setSelected] = useState<string | null>(null);
  const now = new Date();
  const stats = gardenStats(cards, now);
  const level = characterLevel(cards);
  const progress = levelProgress(cards);
  const selectedCard = selected ? cards.find((c) => c.id === selected) : undefined;
  const selectedPlant = selectedCard ? plantOf(selectedCard, now) : null;

  return (
    <div className="screen garden">
      <header className="progress">
        <span>정원</span>
        <button type="button" className="link" onClick={goHome}>
          처음으로
        </button>
      </header>

      <dl className="summary four">
        <div>
          <dt>꽃</dt>
          <dd>{stats.byStage[3]}</dd>
        </div>
        <div>
          <dt>잎·새싹</dt>
          <dd>{stats.byStage[2] + stats.byStage[1]}</dd>
        </div>
        <div>
          <dt>씨앗</dt>
          <dd>{stats.byStage[0]}</dd>
        </div>
        <div>
          <dt>시듦</dt>
          <dd>{stats.wilted}</dd>
        </div>
      </dl>
      <p className="muted small">
        레벨 {level} · 다음 레벨까지 꽃 {progress.needed - progress.current}송이. 크기는 기억이 유지되는 기간, 생기는 지금 기억할
        확률이에요.
      </p>

      {selectedCard && selectedPlant ? <Detail card={selectedCard} plant={selectedPlant} /> : null}

      {THEME_ORDER.map((theme, idx) => {
        const unlocked = profile.unlockedThemes.includes(theme);
        const prev = idx > 0 ? THEME_ORDER[idx - 1]! : null;
        const plants = cards
          .filter((c) => c.theme === theme)
          .map((c) => ({ card: c, plant: plantOf(c, now) }))
          .filter((x): x is { card: StudyCard; plant: Plant } => x.plant !== null);
        const total = cards.filter((c) => c.theme === theme && c.source === 'deck').length;
        if (!unlocked && plants.length === 0) {
          return (
            <section key={theme} className="bed">
              <h2>{THEME_LABELS[theme]}</h2>
              <div className="locked">
                {prev && total > 0
                  ? `아직 갈 수 없어요 - ${THEME_LABELS[prev]} 표현의 ${Math.round(UNLOCK_RATIO * 100)}%가 잎(${UNLOCK_STABILITY}일+)이 되면 열려요. 지금 ${Math.round(themeStableRatio(cards, prev) * 100)}%`
                  : '준비 중인 장소예요'}
              </div>
            </section>
          );
        }
        const bloom = plants.filter((p) => p.plant.stage === 3).length;
        return (
          <section key={theme} className="bed">
            <h2>
              {THEME_LABELS[theme]}
              <span>
                꽃 {bloom} · 심은 표현 {plants.length}
                {total > 0 ? `/${total}` : ''}
              </span>
            </h2>
            {plants.length === 0 ? (
              <div className="locked">아직 심은 표현이 없어요. 오늘의 하루에서 새 표현을 배우면 자라요.</div>
            ) : (
              <div className="plot">
                {plants.map(({ card, plant }) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`plant${selected === card.id ? ' sel' : ''}`}
                    aria-label={`${card.ko} (${plant.wilted ? '시듦' : STAGE_LABELS[plant.stage]})`}
                    onClick={() => setSelected(card.id)}
                  >
                    <PlantIcon stage={plant.stage} wilted={plant.wilted} special={plant.special} />
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
