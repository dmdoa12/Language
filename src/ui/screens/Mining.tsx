import { useState } from 'react';
import { seoulDateKey } from '../../core/date';
import { countIntroducedOn } from '../../core/fsrs';
import { buildMinedCard, createMinedPhrase, validateMinedInput, type MinedCardInput } from '../../core/mining';
import type { MinedPhrase } from '../../core/types';
import { convertMinedPhrase, deleteMinedPhrase, saveMinedPhrase } from '../../db/repository';
import { useCardsStore } from '../../store/cards';
import { useGameStore } from '../../store/game';
import { THEME_LABELS } from '../labels';

function AddForm() {
  const phrases = useCardsStore((s) => s.minedPhrases);
  const setPhrases = useCardsStore((s) => s.setMinedPhrases);
  const [ko, setKo] = useState('');
  const [ja, setJa] = useState('');
  const [note, setNote] = useState('');

  const save = async () => {
    if (ko.trim() === '') return;
    const phrase = createMinedPhrase(crypto.randomUUID(), ko, ja, note, Date.now());
    await saveMinedPhrase(phrase);
    setPhrases([phrase, ...phrases]);
    setKo('');
    setJa('');
    setNote('');
  };

  return (
    <section className="panel form">
      <label htmlFor="mine-ko">말하고 싶었는데 못 한 말 (한국어)</label>
      <textarea id="mine-ko" rows={2} value={ko} onChange={(e) => setKo(e.target.value)} placeholder="예: 생각보다 별로였어" />
      <label htmlFor="mine-ja">일본어 (알면, 나중에 채워도 돼요)</label>
      <input id="mine-ja" lang="ja" value={ja} onChange={(e) => setJa(e.target.value)} />
      <label htmlFor="mine-note">메모 (언제, 누구와)</label>
      <input id="mine-note" value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="button" className="primary" disabled={ko.trim() === ''} onClick={() => void save()}>
        수집함에 저장
      </button>
    </section>
  );
}

function ConvertForm({ phrase, onDone }: { phrase: MinedPhrase; onDone: () => void }) {
  const { cards, profile, minedPhrases, setMinedPhrases, addCard, refreshMeta } = useCardsStore();
  const [input, setInput] = useState<MinedCardInput>({
    ja: phrase.ja ?? '',
    readingsText: '',
    situation: phrase.note,
    theme: profile.unlockedThemes.at(-1) ?? 'konbini',
    grammarTagsText: '',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const remaining = profile.dailyNewLimit - countIntroducedOn(cards, seoulDateKey(new Date()));
  const update = (patch: Partial<MinedCardInput>) => setInput({ ...input, ...patch });

  const submit = async () => {
    const found = validateMinedInput(input);
    if (remaining <= 0) found.push('오늘 새 표현 한도를 다 썼어요. 내일 다시 바꿔 주세요.');
    setErrors(found);
    if (found.length > 0) return;
    const card = buildMinedCard(phrase, input, `mined-${crypto.randomUUID()}`, new Date());
    const linked = await convertMinedPhrase(phrase, card);
    addCard(card);
    setMinedPhrases(minedPhrases.map((p) => (p.id === linked.id ? linked : p)));
    await refreshMeta();
    onDone();
  };

  return (
    <div className="form convert">
      <label htmlFor={`cv-ja-${phrase.id}`}>일본어 문장 (정답 표기)</label>
      <input id={`cv-ja-${phrase.id}`} lang="ja" value={input.ja} onChange={(e) => update({ ja: e.target.value })} />
      <label htmlFor={`cv-rd-${phrase.id}`}>읽기 (히라가나, 여러 개면 줄바꿈)</label>
      <textarea
        id={`cv-rd-${phrase.id}`}
        lang="ja"
        rows={2}
        value={input.readingsText}
        onChange={(e) => update({ readingsText: e.target.value })}
      />
      <label htmlFor={`cv-st-${phrase.id}`}>상황 설명 (문제로 나와요)</label>
      <input id={`cv-st-${phrase.id}`} value={input.situation} onChange={(e) => update({ situation: e.target.value })} />
      <label htmlFor={`cv-th-${phrase.id}`}>테마</label>
      <select
        id={`cv-th-${phrase.id}`}
        value={input.theme}
        onChange={(e) => update({ theme: e.target.value as MinedCardInput['theme'] })}
      >
        {profile.unlockedThemes.map((t) => (
          <option key={t} value={t}>
            {THEME_LABELS[t]}
          </option>
        ))}
      </select>
      <label htmlFor={`cv-gt-${phrase.id}`}>문형 태그 (선택, 쉼표로 구분)</label>
      <input
        id={`cv-gt-${phrase.id}`}
        lang="ja"
        value={input.grammarTagsText}
        onChange={(e) => update({ grammarTagsText: e.target.value })}
      />
      {errors.map((e) => (
        <p key={e} className="input-error">
          {e}
        </p>
      ))}
      <p className="muted small">바꾸면 바로 학습이 시작되고 오늘 새 표현 한도를 1 써요. (남은 한도 {Math.max(0, remaining)})</p>
      <div className="row">
        <button type="button" className="primary" onClick={() => void submit()}>
          카드로 만들기
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          취소
        </button>
      </div>
    </div>
  );
}

function PhraseItem({ phrase }: { phrase: MinedPhrase }) {
  const { minedPhrases, setMinedPhrases } = useCardsStore();
  const [mode, setMode] = useState<'view' | 'convert' | 'confirmDelete'>('view');

  const remove = async () => {
    await deleteMinedPhrase(phrase.id);
    setMinedPhrases(minedPhrases.filter((p) => p.id !== phrase.id));
  };

  return (
    <li className="phrase">
      <p className="phrase-ko">{phrase.ko}</p>
      <p className="phrase-ja" lang="ja">
        {phrase.ja ?? '일본어 미정'}
      </p>
      {phrase.note ? <p className="muted small">{phrase.note}</p> : null}
      {phrase.cardId ? (
        <span className="chip good">카드로 학습 중</span>
      ) : mode === 'convert' ? (
        <ConvertForm phrase={phrase} onDone={() => setMode('view')} />
      ) : mode === 'confirmDelete' ? (
        <div className="row">
          <button type="button" className="link danger" onClick={() => void remove()}>
            정말 삭제
          </button>
          <button type="button" className="link" onClick={() => setMode('view')}>
            취소
          </button>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="link" onClick={() => setMode('convert')}>
            카드로 만들기
          </button>
          <button type="button" className="link" onClick={() => setMode('confirmDelete')}>
            삭제
          </button>
        </div>
      )}
    </li>
  );
}

export function Mining() {
  const phrases = useCardsStore((s) => s.minedPhrases);
  const goHome = useGameStore((s) => s.goHome);
  return (
    <div className="screen mining">
      <header className="progress">
        <span>수집함</span>
        <button type="button" className="link" onClick={goHome}>
          처음으로
        </button>
      </header>
      <p className="muted small">대화하다 말이 막힌 표현을 한국어로만 적어 두세요. 나중에 일본어를 채워 카드로 만들 수 있어요.</p>
      <AddForm />
      {phrases.length === 0 ? (
        <p className="muted">아직 모은 표현이 없어요.</p>
      ) : (
        <ul className="phrase-list">
          {phrases.map((p) => (
            <PhraseItem key={p.id} phrase={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
