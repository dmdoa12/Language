// Web Speech API 음성 인식 (ja-JP). Chrome·Safari 는 접두사 버전을 쓴다.
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return ctor() !== null;
}

export interface SpeechHandlers {
  onText: (text: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

const ERROR_LABELS: Record<string, string> = {
  'not-allowed': '마이크 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.',
  'service-not-allowed': '이 브라우저에서는 음성 인식을 쓸 수 없어요.',
  'no-speech': '말소리가 들리지 않았어요.',
  network: '음성 인식 서버에 연결하지 못했어요.',
  'audio-capture': '마이크를 찾지 못했어요.',
};

// 한 문장을 듣는다. 반환값으로 중지.
export function listenOnce(handlers: SpeechHandlers): () => void {
  const Ctor = ctor();
  if (!Ctor) {
    handlers.onError('이 브라우저는 음성 인식을 지원하지 않아요.');
    handlers.onEnd();
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = 'ja-JP';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i]!;
      text += r[0].transcript;
      final = r.isFinal;
    }
    handlers.onText(text, final);
  };
  rec.onerror = (e) => {
    if (e.error !== 'aborted') handlers.onError(ERROR_LABELS[e.error] ?? `음성 인식 오류: ${e.error}`);
  };
  rec.onend = handlers.onEnd;
  rec.start();
  return () => rec.stop();
}
