import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isSpeechSupported, listenOnce } from '../speech';

interface Props {
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string) => void | boolean | Promise<void | boolean>;
  error?: string | null;
  busy?: boolean;
  allowVoice?: boolean;
  voiceOnly?: boolean; //   도전 옵션: 말로만 답하기 (음성 인식을 지원할 때만)
  deadline?: number | null; // 도전 옵션: 이 시각(ms)에 지금까지 입력한 내용으로 자동 제출
}

// IME 변환 확정용 Enter 는 제출로 보지 않는다 (isComposing / keyCode 229).
export function JaInput({
  placeholder,
  submitLabel,
  onSubmit,
  error,
  busy = false,
  allowVoice = true,
  voiceOnly = false,
  deadline = null,
}: Props) {
  const [value, setValue] = useState('');
  const valueRef = useRef('');
  valueRef.current = value;
  const [remaining, setRemaining] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const voice = allowVoice && isSpeechSupported();
  const typingLocked = voiceOnly && voice;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(timer);
        stopRef.current?.();
        void onSubmitRef.current(valueRef.current);
      }
    };
    const timer = setInterval(tick, 250);
    tick();
    return () => clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    ref.current?.focus();
    return () => stopRef.current?.();
  }, []);

  const submit = async () => {
    if (value.trim() === '' || busy) return;
    stopRef.current?.();
    const ok = await onSubmit(value);
    if (ok === false) ref.current?.select();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    e.preventDefault();
    void submit();
  };

  const toggleVoice = () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setVoiceError(null);
    setListening(true);
    stopRef.current = listenOnce({
      onText: (text) => setValue(text),
      onEnd: () => {
        setListening(false);
        stopRef.current = null;
      },
      onError: setVoiceError,
    });
  };

  return (
    <div className="ja-input">
      <div className="input-row">
        <input
          ref={ref}
          lang="ja"
          type="text"
          value={value}
          readOnly={typingLocked}
          placeholder={listening ? '듣는 중…' : typingLocked ? '말하기를 눌러 답하세요' : placeholder}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {voice ? (
          <button
            type="button"
            className={`mic ${listening ? 'on' : ''}`}
            aria-pressed={listening}
            aria-label={listening ? '음성 입력 멈추기' : '음성으로 입력'}
            onClick={toggleVoice}
          >
            {listening ? '멈춤' : '말하기'}
          </button>
        ) : null}
      </div>
      {remaining !== null ? (
        <p className={`countdown${remaining <= 5 ? ' urgent' : ''}`} aria-live="polite">
          남은 시간 {remaining}초
        </p>
      ) : null}
      {voiceOnly && !voice ? <p className="muted small">이 브라우저는 음성 인식을 지원하지 않아 입력으로 답해요.</p> : null}
      {voiceError ? <p className="input-error">{voiceError}</p> : null}
      {error ? <p className="input-error">{error}</p> : null}
      <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
        {busy ? 'AI 가 확인하는 중…' : submitLabel}
      </button>
    </div>
  );
}
