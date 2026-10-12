import type { StudyCard } from '../../core/types';
import { isTtsSupported, speak } from '../tts';

export function AnswerPanel({ card }: { card: StudyCard }) {
  return (
    <section className="answer-panel">
      <p className="answer-ja" lang="ja">
        {card.ja}
      </p>
      <p className="answer-reading" lang="ja">
        {card.readings[0]}
      </p>
      <p className="answer-ko">{card.ko}</p>
      {card.grammarTags.length > 0 ? (
        <ul className="tags">
          {card.grammarTags.map((t) => (
            <li key={t} lang="ja">
              {t}
            </li>
          ))}
        </ul>
      ) : null}
      {isTtsSupported() ? (
        <button type="button" className="secondary" onClick={() => speak(card.ja)}>
          다시 듣기
        </button>
      ) : null}
    </section>
  );
}
