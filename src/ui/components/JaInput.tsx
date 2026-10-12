import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface Props {
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string) => void | boolean | Promise<void | boolean>;
  error?: string | null;
}

// IME 변환 확정용 Enter 는 제출로 보지 않는다 (isComposing / keyCode 229).
export function JaInput({ placeholder, submitLabel, onSubmit, error }: Props) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = async () => {
    if (value.trim() === '') return;
    const ok = await onSubmit(value);
    if (ok === false) ref.current?.select();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    e.preventDefault();
    void submit();
  };

  return (
    <div className="ja-input">
      <input
        ref={ref}
        lang="ja"
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {error ? <p className="input-error">{error}</p> : null}
      <button type="button" className="primary" onClick={() => void submit()}>
        {submitLabel}
      </button>
    </div>
  );
}
