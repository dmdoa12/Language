import { useState } from 'react';
import {
  characterLevel,
  levelProgress,
  MASTERED_STABILITY,
  themeStableRatio,
  UNLOCK_RATIO,
  UNLOCK_STABILITY,
} from '../../core/meta';
import { getRelic } from '../../core/relics';
import { THEME_ORDER, type StudyCard, type Theme } from '../../core/types';
import { useCardsStore } from '../../store/cards';
import { useGameStore } from '../../store/game';
import { THEME_LABELS } from '../labels';

function stage(card: StudyCard): { label: string; tone: string } {
  if (card.introducedAt === null) return { label: '안 배움', tone: 'muted' };
  if (card.fsrs.stability >= MASTERED_STABILITY) return { label: '숙달', tone: 'good' };
  if (card.fsrs.stability >= UNLOCK_STABILITY) return { label: '익숙', tone: 'accent' };
  return { label: '학습 중', tone: 'hard' };
}

export function Collection() {
  const cards = useCardsStore((s) => s.cards);
  const profile = useCardsStore((s) => s.profile);
  const goHome = useGameStore((s) => s.goHome);
  const [theme, setTheme] = useState<Theme>(profile.unlockedThemes.at(-1) ?? 'konbini');

  const level = characterLevel(cards);
  const progress = levelProgress(cards);
  const themeCards = cards.filter((c) => c.theme === theme);
  const unlocked = profile.unlockedThemes.includes(theme);
  const idx = THEME_ORDER.indexOf(theme);
  const prev = idx > 0 ? THEME_ORDER[idx - 1]! : null;

  return (
    <div className="screen collection">
      <header className="progress">
        <span>도감</span>
        <button type="button" className="link" onClick={goHome}>
          처음으로
        </button>
      </header>

      <section className="panel">
        <p className="level">레벨 {level}</p>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={progress.needed} aria-valuenow={progress.current}>
          <span style={{ width: `${(progress.current / progress.needed) * 100}%` }} />
        </div>
        <p className="muted small">
          숙달(안정도 {MASTERED_STABILITY}일 이상) 표현 {progress.current}/{progress.needed} · 다음 레벨까지
        </p>
      </section>

      <section className="panel">
        <h3>보유 유물</h3>
        {profile.ownedRelicIds.length === 0 ? (
          <p className="muted small">수집함 표현을 카드로 만들어 숙달하면 희귀 유물을 얻어요. 얻은 유물은 매 런 시작 때 장착돼요.</p>
        ) : (
          <ul className="relic-list">
            {profile.ownedRelicIds.map((id) => {
              const r = getRelic(id);
              return r ? (
                <li key={id}>
                  <strong>{r.name}</strong> <span className="muted">{r.description}</span>
                </li>
              ) : null;
            })}
          </ul>
        )}
      </section>

      <div className="tabs" role="tablist">
        {THEME_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === theme}
            className={`tab ${t === theme ? 'active' : ''} ${profile.unlockedThemes.includes(t) ? '' : 'locked'}`}
            onClick={() => setTheme(t)}
          >
            {THEME_LABELS[t]}
          </button>
        ))}
      </div>

      {!unlocked && prev ? (
        <p className="muted">
          잠김: {THEME_LABELS[prev]} 덱의 {Math.round(UNLOCK_RATIO * 100)}%를 익숙(안정도 {UNLOCK_STABILITY}일 이상)하게 만들면 열려요.
          현재 {Math.round(themeStableRatio(cards, prev) * 100)}%
        </p>
      ) : null}

      {themeCards.length === 0 ? (
        <p className="muted">이 테마의 표현은 아직 준비 중이에요.</p>
      ) : (
        <ul className="card-list">
          {themeCards.map((c) => {
            const st = stage(c);
            const learned = c.introducedAt !== null;
            return (
              <li key={c.id} className={learned ? '' : 'unlearned'}>
                <div className="card-row">
                  <span className="card-ko">{c.ko}</span>
                  <span className={`chip ${st.tone}`}>{st.label}</span>
                </div>
                {learned ? (
                  <span className="card-ja" lang="ja">
                    {c.ja}
                  </span>
                ) : null}
                {c.source === 'mined' ? <span className="muted small">수집함에서 만든 표현</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
