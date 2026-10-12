import { useEffect, useRef } from 'react';
import { eveningChatTheme } from '../../core/day';
import { getCard } from '../../store/cards';
import { useDayStore } from '../../store/day';
import { JaInput } from '../components/JaInput';
import { THEME_LABELS, THEME_SCENES } from '../labels';
import { isTtsSupported, speak } from '../tts';

// 하루 마무리 대화 (AI 연결 시). 복습 기록과 무관한 자유 대화.
export function EveningChat() {
  const day = useDayStore((s) => s.day)!;
  const chat = useDayStore((s) => s.chat)!;
  const sendChat = useDayStore((s) => s.sendChat);
  const finishChat = useDayStore((s) => s.finishChat);
  const endRef = useRef<HTMLDivElement>(null);
  const spokenRef = useRef(-1);
  const lastIndex = chat.lines.length - 1;
  const last = chat.lines[lastIndex];
  const theme = eveningChatTheme(day);

  useEffect(() => {
    if (last?.role === 'staff' && spokenRef.current !== lastIndex) {
      spokenRef.current = lastIndex;
      speak(last.text);
    }
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [last, lastIndex]);

  return (
    <div className="screen chat">
      <header className="progress">
        <span>하루 마무리 대화 · {theme ? `${THEME_LABELS[theme]}의 ${THEME_SCENES[theme].partner}` : ''}</span>
        <span className="hud-stat">
          오늘 표현 <strong>{chat.usedIds.length}</strong>
        </span>
      </header>
      <p className="muted small">오늘 말한 표현을 자연스럽게 써 보세요. 복습 기록에는 영향이 없어요.</p>

      <ol className="chat-log">
        {chat.lines.map((line, i) => (
          <li key={i} className={`bubble ${line.role}`}>
            <p lang="ja">{line.text}</p>
            {line.ko ? <p className="muted small">{line.ko}</p> : null}
            {line.role === 'staff' && isTtsSupported() ? (
              <button type="button" className="link" onClick={() => speak(line.text)}>
                다시 듣기
              </button>
            ) : null}
            {line.correction ? <p className="bubble-note">{line.correction}</p> : null}
          </li>
        ))}
        {chat.loading ? <li className="bubble staff muted">…</li> : null}
      </ol>
      <div ref={endRef} />

      {chat.error ? <p className="input-error">{chat.error}</p> : null}

      {chat.usedIds.length > 0 ? (
        <ul className="tags">
          {chat.usedIds.map((id) => (
            <li key={id} lang="ja">
              {getCard(id).ja}
            </li>
          ))}
        </ul>
      ) : null}

      {chat.done ? (
        <button type="button" className="primary" onClick={() => void finishChat()}>
          대화 끝내기
        </button>
      ) : (
        <>
          <JaInput
            key={chat.lines.length}
            placeholder="일본어로 대답해 보세요"
            submitLabel="보내기"
            busy={chat.loading}
            onSubmit={(v) => sendChat(v)}
          />
          <button type="button" className="secondary" onClick={() => void finishChat()}>
            여기서 끝내기
          </button>
        </>
      )}
    </div>
  );
}
