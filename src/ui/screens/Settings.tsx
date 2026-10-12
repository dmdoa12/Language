import { useRef, useState } from 'react';
import { loadReader, readerStatus } from '../../api/japaneseReader';
import { checkConnection, DIRECT_DAILY_LIMIT, loadLlmConfig, saveLlmConfig, type LlmConfig } from '../../api/llm';
import { parseBackup, type BackupData } from '../../core/backup';
import type { ChallengeOptions } from '../../core/types';
import { isSpeechSupported } from '../speech';
import { seoulDateKey } from '../../core/date';
import { ensureSeeded, exportAll, importAll } from '../../db/repository';
import { useCardsStore } from '../../store/cards';
import { useDayStore } from '../../store/day';

function ChallengePanel() {
  const profile = useCardsStore((s) => s.profile);
  const setProfile = useCardsStore((s) => s.setProfile);
  const voiceSupported = isSpeechSupported();
  const toggle = (key: keyof ChallengeOptions) =>
    void setProfile({ ...profile, challenge: { ...profile.challenge, [key]: !profile.challenge[key] } });
  const options: Array<{ key: keyof ChallengeOptions; label: string; detail: string }> = [
    { key: 'noHint', label: '힌트 없이', detail: '문제에서 힌트 버튼을 숨겨요.' },
    { key: 'timeLimit', label: '익숙한 문장은 15초 안에', detail: '기억이 30일 이상 유지되는 문장은 15초가 지나면 입력한 대로 제출돼요.' },
    {
      key: 'voiceOnly',
      label: '말로만 답하기',
      detail: voiceSupported ? '입력창 대신 말하기 버튼으로만 답해요.' : '이 브라우저는 음성 인식을 지원하지 않아 켜도 입력으로 답해요.',
    },
  ];
  return (
    <section className="panel">
      <h3>도전 옵션</h3>
      <ul className="toggle-list">
        {options.map((o) => (
          <li key={o.key}>
            <label className="toggle" htmlFor={`challenge-${o.key}`}>
              <input
                id={`challenge-${o.key}`}
                type="checkbox"
                checked={profile.challenge[o.key]}
                onChange={() => toggle(o.key)}
              />
              <span>
                <span className="toggle-label">{o.label}</span>
                <span className="muted small">{o.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

const READER_LABEL = {
  idle: '아직 받지 않았어요.',
  loading: '받는 중이에요 (처음 한 번, 약 17MB).',
  ready: '준비됐어요. 다른 한자 표기나 음성 인식 결과도 같은 발음의 같은 문장이면 정답으로 봐요.',
  failed: '받지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.',
} as const;

function ReaderStatusPanel() {
  const [status, setStatus] = useState(readerStatus());
  const retry = async () => {
    setStatus('loading');
    await loadReader();
    setStatus(readerStatus());
  };
  return (
    <section className="panel">
      <h3>일본어 분석 사전 (채점용)</h3>
      <p className="muted small">{READER_LABEL[status]}</p>
      {status === 'failed' || status === 'idle' ? (
        <button type="button" className="secondary" onClick={() => void retry()}>
          지금 받기
        </button>
      ) : null}
    </section>
  );
}

function AiSettings() {
  const initial = loadLlmConfig();
  const [mode, setMode] = useState<LlmConfig['mode']>(initial?.mode ?? 'direct');
  const [apiKey, setApiKey] = useState(initial?.mode === 'direct' ? initial.apiKey : '');
  const [endpoint, setEndpoint] = useState(initial?.mode === 'worker' ? initial.endpoint : '');
  const [accessKey, setAccessKey] = useState(initial?.mode === 'worker' ? initial.accessKey : '');
  const [connected, setConnected] = useState(initial !== null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    initial ? { ok: true, text: '연결 정보가 저장돼 있어요.' } : null,
  );
  const [checking, setChecking] = useState(false);

  const build = (): LlmConfig | string => {
    if (mode === 'direct') {
      const key = apiKey.trim();
      if (!key.startsWith('sk-')) return 'sk- 로 시작하는 Claude API 키를 입력해 주세요.';
      return { mode: 'direct', apiKey: key };
    }
    const config = { mode: 'worker' as const, endpoint: endpoint.trim(), accessKey: accessKey.trim() };
    if (!/^https?:\/\//.test(config.endpoint) || config.accessKey === '') {
      return 'https:// 로 시작하는 Worker 주소와 접속 암호를 모두 입력해 주세요.';
    }
    return config;
  };

  const save = async () => {
    const config = build();
    if (typeof config === 'string') {
      setStatus({ ok: false, text: config });
      return;
    }
    setChecking(true);
    try {
      await checkConnection(config);
      saveLlmConfig(config);
      setConnected(true);
      setStatus({ ok: true, text: '연결됐어요. 이제 AI 채점·첨삭과 보스 대화를 쓸 수 있어요.' });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setChecking(false);
    }
  };

  const disconnect = () => {
    saveLlmConfig(null);
    setApiKey('');
    setAccessKey('');
    setConnected(false);
    setStatus({ ok: false, text: '연결을 해제했어요. 채점은 기존 방식으로만 해요.' });
  };

  return (
    <section className="panel form">
      <h3>AI 채점·대화</h3>
      <p className="muted small">
        연결하면 표준 문장과 다르게 말해도 뜻이 맞는지 Claude 가 판정하고 첨삭해 줘요. 보스를 이기면 보너스 대화도 할 수
        있어요.
      </p>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'direct'}
          className={`tab ${mode === 'direct' ? 'active' : ''}`}
          onClick={() => setMode('direct')}
        >
          API 키 직접
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'worker'}
          className={`tab ${mode === 'worker' ? 'active' : ''}`}
          onClick={() => setMode('worker')}
        >
          Worker 서버
        </button>
      </div>

      {mode === 'direct' ? (
        <>
          <label htmlFor="llm-api-key">Claude API 키</label>
          <input
            id="llm-api-key"
            type="password"
            autoComplete="off"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="muted small">
            키는 이 기기 브라우저에만 저장되고 Claude API 로만 보내져요. 이 앱 전용 키를 새로 만들고, Anthropic 콘솔에서 월 사용
            한도(예: 5달러)를 걸어 두세요. 이 기기에서 하루 {DIRECT_DAILY_LIMIT}회까지만 호출해요. 공용 기기에는 넣지 마세요.
          </p>
        </>
      ) : (
        <>
          <label htmlFor="llm-endpoint">Worker 주소</label>
          <input
            id="llm-endpoint"
            type="url"
            inputMode="url"
            placeholder="https://jp-talk-worker.<계정>.workers.dev"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
          <label htmlFor="llm-key">접속 암호</label>
          <input
            id="llm-key"
            type="password"
            autoComplete="off"
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
          />
          <p className="muted small">API 키를 기기에 두지 않는 방식이에요. README 의 Worker 배포 절차가 필요해요.</p>
        </>
      )}

      {status ? <p className={status.ok ? 'note' : 'input-error'}>{status.text}</p> : null}
      <div className="row">
        <button type="button" className="primary" disabled={checking} onClick={() => void save()}>
          {checking ? '확인 중…' : '연결 확인 후 저장'}
        </button>
        {connected ? (
          <button type="button" className="secondary" onClick={disconnect}>
            연결 해제
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function Settings() {
  const profile = useCardsStore((s) => s.profile);
  const setProfile = useCardsStore((s) => s.setProfile);
  const goHome = useDayStore((s) => s.goHome);
  const [limit, setLimit] = useState(String(profile.dailyNewLimit));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const limitValue = Number(limit);
  const limitValid = Number.isInteger(limitValue) && limitValue >= 1 && limitValue <= 50;

  const saveLimit = async () => {
    if (!limitValid) return;
    await setProfile({ ...profile, dailyNewLimit: limitValue });
    setMessage(`하루 새 표현 한도를 ${limitValue}개로 저장했어요.`);
  };

  const doExport = async () => {
    const json = await exportAll(Date.now());
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `jp-talk-backup-${seoulDateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('백업 파일을 내려받았어요.');
  };

  const onFile = async (file: File | undefined) => {
    setImportError(null);
    setPending(null);
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    await importAll(pending);
    await ensureSeeded(new Date());
    const store = useCardsStore.getState();
    await store.reload();
    await store.refreshMeta();
    useDayStore.setState({ day: null, line: null, chat: null });
    setPending(null);
    if (fileRef.current) fileRef.current.value = '';
    setLimit(String(useCardsStore.getState().profile.dailyNewLimit));
    setMessage('백업에서 기록을 가져왔어요.');
  };

  return (
    <div className="screen settings">
      <header className="progress">
        <span>설정</span>
        <button type="button" className="link" onClick={goHome}>
          처음으로
        </button>
      </header>

      {message ? <p className="note">{message}</p> : null}

      <section className="panel form">
        <label htmlFor="daily-limit">하루 새 표현 한도 (1~50)</label>
        <input
          id="daily-limit"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
        {!limitValid ? <p className="input-error">1부터 50 사이의 정수로 입력해 주세요.</p> : null}
        <button type="button" className="primary" disabled={!limitValid} onClick={() => void saveLimit()}>
          저장
        </button>
      </section>

      <ChallengePanel />

      <ReaderStatusPanel />

      <AiSettings />

      <section className="panel form">
        <h3>백업</h3>
        <p className="muted small">학습 기록은 이 브라우저에만 저장돼요. 기기를 바꾸기 전에 내보내 두세요.</p>
        <button type="button" className="secondary" onClick={() => void doExport()}>
          JSON으로 내보내기
        </button>
        <label htmlFor="import-file">JSON 가져오기</label>
        <input
          id="import-file"
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {importError ? <p className="input-error">{importError}</p> : null}
        {pending ? (
          <div className="confirm">
            <p>
              카드 {pending.cards.length}장, 복습 기록 {pending.reviewLogs.length}개를 가져와요. 지금 기록은 모두 이 백업으로
              바뀌어요.
            </p>
            <div className="row">
              <button type="button" className="primary danger-bg" onClick={() => void confirmImport()}>
                덮어쓰고 가져오기
              </button>
              <button type="button" className="secondary" onClick={() => setPending(null)}>
                취소
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
