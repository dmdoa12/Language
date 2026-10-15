import { useEffect } from 'react';
import { loadReader } from '../api/japaneseReader';
import { useCardsStore } from '../store/cards';
import { useDayStore } from '../store/day';
import { useSyncStore } from '../store/sync';
import { DayScreen } from './screens/DayScreen';
import { DaySummary } from './screens/DaySummary';
import { EveningChat } from './screens/EveningChat';
import { Garden } from './screens/Garden';
import { Home } from './screens/Home';
import { Mining } from './screens/Mining';
import { QuickReview } from './screens/QuickReview';
import { SceneResult } from './screens/SceneResult';
import { Settings } from './screens/Settings';
import './styles.css';

function CurrentScreen() {
  const screen = useDayStore((s) => s.screen);
  const day = useDayStore((s) => s.day);
  const line = useDayStore((s) => s.line);
  const chat = useDayStore((s) => s.chat);
  const lastSceneIndex = useDayStore((s) => s.lastSceneIndex);

  switch (screen) {
    case 'day':
      return day && line ? <DayScreen /> : <Home />;
    case 'sceneResult':
      return day && lastSceneIndex !== null ? <SceneResult /> : <Home />;
    case 'summary':
      return day ? <DaySummary /> : <Home />;
    case 'chat':
      return day && chat ? <EveningChat /> : <Home />;
    case 'review':
      return <QuickReview />;
    case 'garden':
      return <Garden />;
    case 'mining':
      return <Mining />;
    case 'settings':
      return <Settings />;
    case 'home':
      return <Home />;
  }
}

export function App() {
  const loaded = useCardsStore((s) => s.loaded);
  const error = useCardsStore((s) => s.error);
  const init = useCardsStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  // 앱을 열면 다른 기기의 기록을 받아 합친다 (동기화를 켰을 때)
  useEffect(() => {
    if (loaded) void useSyncStore.getState().syncNow({ force: true });
  }, [loaded]);

  // 첫 화면이 뜬 뒤 형태소 분석 사전을 백그라운드에서 받는다 (실패해도 채점은 기존 방식으로 동작)
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => void loadReader(), 1500);
    return () => clearTimeout(timer);
  }, [loaded]);

  return (
    <main className="app">
      {error ? <p className="input-error">저장소를 열 수 없어요: {error}</p> : null}
      {!loaded && !error ? <p className="muted">불러오는 중…</p> : null}
      {loaded ? <CurrentScreen /> : null}
    </main>
  );
}
