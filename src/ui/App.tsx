import { useEffect } from 'react';
import { useReviewStore } from '../store/review';
import { Home } from './screens/Home';
import { Review } from './screens/Review';
import './styles.css';

export function App() {
  const phase = useReviewStore((s) => s.phase);
  const error = useReviewStore((s) => s.error);
  const init = useReviewStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <main className="app">
      {error ? <p className="input-error">저장소를 열 수 없어요: {error}</p> : null}
      {phase === 'loading' && !error ? <p className="muted">불러오는 중…</p> : null}
      {phase === 'home' ? <Home /> : null}
      {phase !== 'loading' && phase !== 'home' ? <Review /> : null}
    </main>
  );
}
