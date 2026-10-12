import { useRef, useState } from 'react';
import { checkConnection, loadLlmConfig, saveLlmConfig } from '../../api/llm';
import { parseBackup, type BackupData } from '../../core/backup';
import { seoulDateKey } from '../../core/date';
import { ensureSeeded, exportAll, importAll } from '../../db/repository';
import { useCardsStore } from '../../store/cards';
import { useGameStore } from '../../store/game';

function AiSettings() {
  const initial = loadLlmConfig();
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? '');
  const [accessKey, setAccessKey] = useState(initial?.accessKey ?? '');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    initial ? { ok: true, text: '연결 정보가 저장돼 있어요.' } : null,
  );
  const [checking, setChecking] = useState(false);

  const save = async () => {
    const config = { endpoint: endpoint.trim(), accessKey: accessKey.trim() };
    if (!/^https?:\/\//.test(config.endpoint) || config.accessKey === '') {
      setStatus({ ok: false, text: 'https:// 로 시작하는 Worker 주소와 접속 암호를 모두 입력해 주세요.' });
      return;
    }
    setChecking(true);
    try {
      await checkConnection(config);
      saveLlmConfig(config);
      setStatus({ ok: true, text: '연결됐어요. 이제 AI 채점·첨삭과 보스 대화를 쓸 수 있어요.' });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setChecking(false);
    }
  };

  const disconnect = () => {
    saveLlmConfig(null);
    setAccessKey('');
    setStatus({ ok: false, text: '연결을 해제했어요. 채점은 기존 방식으로만 해요.' });
  };

  return (
    <section className="panel form">
      <h3>AI 채점·대화</h3>
      <p className="muted small">
        Cloudflare Worker 주소와 접속 암호를 넣으면 표준 문장과 다르게 말해도 뜻이 맞는지 AI 가 판정하고 첨삭해 줘요. 이 기기에만
        저장돼요.
      </p>
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
      {status ? <p className={status.ok ? 'note' : 'input-error'}>{status.text}</p> : null}
      <div className="row">
        <button type="button" className="primary" disabled={checking} onClick={() => void save()}>
          {checking ? '확인 중…' : '연결 확인 후 저장'}
        </button>
        {initial ? (
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
  const goHome = useGameStore((s) => s.goHome);
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
    useGameStore.setState({ run: null, battle: null, reward: null });
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
