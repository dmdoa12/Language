import type { StudyCard } from '../../core/types';
import { isTtsSupported, speak } from '../tts';
import { SentenceStructure } from './SentenceStructure';

export function AnswerPanel({ card, compareInput }: { card: StudyCard; compareInput?: string | null }) {
  return (
    <section className="answer-panel">
      <SentenceStructure text={card.ja} grammarTags={card.grammarTags} compareInput={compareInput} />
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
