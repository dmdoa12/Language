// 서비스 워커 등록과 업데이트 적용.
// 새 버전이 배포되면 받아서 활성화되는 즉시 새로고침한다. 단 장면 진행·대화 중에는
// 입력이 끊기지 않도록 미뤘다가 홈 등으로 돌아올 때 적용한다.
import { registerSW } from 'virtual:pwa-register';
import { useDayStore, type Screen } from './store/day';

const SAFE_SCREENS: readonly Screen[] = ['home', 'garden', 'mining', 'settings', 'summary'];
const UPDATE_CHECK_MS = 60 * 60 * 1000;

let pendingReload = false;

function reloadWhenSafe(): void {
  if (SAFE_SCREENS.includes(useDayStore.getState().screen)) {
    window.location.reload();
    return;
  }
  if (pendingReload) return;
  pendingReload = true;
  const unsubscribe = useDayStore.subscribe((state) => {
    if (SAFE_SCREENS.includes(state.screen)) {
      unsubscribe();
      window.location.reload();
    }
  });
}

export function setupPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onNeedReload: reloadWhenSafe,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // 홈 화면에 설치한 앱은 오래 켜 두므로 주기적으로, 그리고 다시 볼 때마다 새 버전을 확인한다
      const check = () => {
        if (navigator.onLine) void registration.update();
      };
      setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}
