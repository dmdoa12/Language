import { useEffect, useState } from 'react';
import { onReaderReady, readerStatus } from '../api/japaneseReader';

// 형태소 분석 사전이 준비되면 다시 그린다.
export function useReaderReady(): boolean {
  const [ready, setReady] = useState(readerStatus() === 'ready');
  useEffect(() => {
    if (ready) return;
    return onReaderReady(() => setReady(true));
  }, [ready]);
  return ready;
}
