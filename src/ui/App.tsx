import { useEffect } from 'react';
import { useCardsStore } from '../store/cards';
import { useGameStore } from '../store/game';
import { Battle } from './screens/Battle';
import { BossChat } from './screens/BossChat';
import { Collection } from './screens/Collection';
import { Home } from './screens/Home';
import { MapScreen } from './screens/MapScreen';
import { Mining } from './screens/Mining';
import { QuickReview } from './screens/QuickReview';
import { Reward } from './screens/Reward';
import { RunResult } from './screens/RunResult';
import { Settings } from './screens/Settings';
import { Shop } from './screens/Shop';
import './styles.css';

function CurrentScreen() {
  const screen = useGameStore((s) => s.screen);
  const run = useGameStore((s) => s.run);
  const battle = useGameStore((s) => s.battle);
  const reward = useGameStore((s) => s.reward);
  const chat = useGameStore((s) => s.chat);

  switch (screen) {
    case 'review':
      return <QuickReview />;
    case 'map':
      return run ? <MapScreen /> : <Home />;
    case 'battle':
      return run && battle ? <Battle /> : <Home />;
    case 'shop':
      return run ? <Shop /> : <Home />;
    case 'reward':
      return run && reward ? <Reward /> : <Home />;
    case 'result':
      return run ? <RunResult /> : <Home />;
    case 'chat':
      return run && chat ? <BossChat /> : <Home />;
    case 'mining':
      return <Mining />;
    case 'collection':
      return <Collection />;
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

  return (
    <main className="app">
      {error ? <p className="input-error">저장소를 열 수 없어요: {error}</p> : null}
      {!loaded && !error ? <p className="muted">불러오는 중…</p> : null}
      {loaded ? <CurrentScreen /> : null}
    </main>
  );
}
