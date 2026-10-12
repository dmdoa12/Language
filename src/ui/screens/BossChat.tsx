import { useEffect, useRef } from 'react';
import { chatBonusGold } from '../../core/run';
import { getCard } from '../../store/cards';
import { useGameStore } from '../../store/game';
import { JaInput } from '../components/JaInput';
import { THEME_LABELS } from '../labels';
import { isTtsSupported, speak } from '../tts';

export function BossChat() {
  const run = useGameStore((s) => s.run)!;
  const chat = useGameStore((s) => s.chat)!;
  const sendChat = useGameStore((s) => s.sendChat);
  const finishChat = useGameStore((s) => s.finishChat);
  const endRef = useRef<HTMLDivElement>(null);
  const spokenRef = useRef(-1);
  const lastIndex = chat.lines.length - 1;
  const last = chat.lines[lastIndex];

  useEffect(() => {
    // 새 직원 대사가 붙었을 때만 한 번 읽어 준다
    if (last?.role === 'staff' && spokenRef.current !== lastIndex) {
      spokenRef.current = lastIndex;
      speak(last.text);
    }
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [last, lastIndex]);

  const bonus = chatBonusGold(run, chat.usedIds.length);

  return (
    <div className="screen chat">
      <header className="progress">
        <span>보너스 대화 · {run.mainTheme ? THEME_LABELS[run.mainTheme] : ''}</span>
        <span className="hud-stat">
          쓴 표현 <strong>{chat.usedIds.length}</strong> · +{bonus}골드
        </span>
      </header>
      <p className="muted small">오늘 복습한 표현을 대화에서 써 보세요. 복습 기록과 체력에는 영향이 없어요.</p>

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
          대화 끝내고 보너스 받기 (+{bonus}골드)
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
