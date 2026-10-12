# 일본어 회화 로그라이크 (프로젝트 명세)

## 목표
일본인과 일상 프리토킹이 가능한 수준의 **산출 어휘력** 확보.
사용자는 JLPT N2 소지(청해 강함, 어휘·문법 약함). 알아보기(인식)는 이미 되므로
**한국어 상황 → 일본어로 말하기/입력하기(출력)** 훈련이 핵심이다.

## 핵심 원칙 (모든 설계 판단의 기준)
1. 단어가 아니라 **실제로 쓰는 문장 덩어리**를 카드로 한다. N3~N2 문형은 문장 안에 녹인다.
2. 카드 방향은 **한→일 출력**이 기본. 객관식 금지.
3. 복습 일정은 **FSRS(ts-fsrs)** 가 결정한다. 게임 로직은 FSRS 데이터를 절대 왜곡하지 않는다.
4. 보상은 활동량이 아니라 **기억 유지량**에 준다.
5. 채점은 **자동 판정**. 자기 채점 금지(HP가 걸려 있어 관대해지므로 FSRS 데이터 오염).
6. 그날 복습 대상 카드는 **맵의 어느 경로로 가도 전부 등장**해야 한다.
7. 런에서 죽어도 **학습 기록은 잃지 않는다**. 잃는 건 런 보상뿐.

## 기술 스택
- Vite + React + TypeScript (strict)
- 상태: Zustand / 저장: Dexie (IndexedDB)
- 복습: ts-fsrs / 가나 정규화: wanakana / 시드 난수: seedrandom
- 테스트: Vitest
- PWA: vite-plugin-pwa / 배포: GitHub Pages (GitHub Actions)
- TTS: Web Speech API `speechSynthesis` (lang `ja-JP`)
- 위 목록 외 라이브러리는 추가 전에 반드시 물어볼 것.

## 폴더 구조
```
src/
  core/          # 순수 함수만. UI·DB 의존 금지. 전부 테스트 대상
    fsrs.ts        # ts-fsrs 래퍼, 등급 산정
    answer.ts      # 정답 판정 (정규화, 근접 오답)
    mapgen.ts      # 시드 기반 맵 생성
    run.ts         # 런 진행 상태 전이 (HP, 노드 클리어, 보상)
    relics.ts      # 유물 효과
    meta.ts        # 레벨·해금 계산
  db/            # Dexie 스키마, 리포지토리
  store/         # Zustand
  ui/
    screens/     # Home, Map, Battle, Reward, Shop, Rest, RunResult, Collection, Mining, Settings
    components/
  data/seed/     # 초기 카드 JSON
tests/
```

## 데이터 스키마
```ts
type Theme = 'konbini' | 'cafe' | 'restaurant' | 'directions' | 'friends_plan' | 'smalltalk' | 'consult';

interface StudyCard {
  id: string;
  ja: string;                 // 표준 정답 문장 (한자 포함)
  readings: string[];         // 허용 정답 (전부 히라가나). 최소 1개
  ko: string;                 // 한국어 의미
  situation: string;          // 한국어 상황 설명 (전투 화면 문제로 표시)
  theme: Theme;
  grammarTags: string[];      // 예: ['〜てしまう']
  source: 'deck' | 'mined';
  fsrs: import('ts-fsrs').Card;
  introducedAt: number | null; // null = 아직 안 배움 (상점에서 구매 시 설정)
}

interface ReviewLogEntry {
  id: string;
  cardId: string;
  runId: string | null;
  rating: 'again' | 'hard' | 'good';
  input: string;
  hintUsed: boolean;
  elapsedMs: number;
  answeredAt: number;
  fsrsLog: import('ts-fsrs').ReviewLog;
}

type NodeType = 'battle' | 'elite' | 'shop' | 'rest' | 'event' | 'boss';

interface MapNode {
  id: string;
  floor: number;
  type: NodeType;
  cardIds: string[];
  next: string[];             // 다음 층 연결 노드 id
  cleared: boolean;
}

interface Run {
  id: string;
  seed: string;
  date: string;               // YYYY-MM-DD (Asia/Seoul)
  nodes: MapNode[];
  currentNodeId: string | null;
  hp: number;
  maxHp: number;
  gold: number;
  relicIds: string[];
  status: 'active' | 'won' | 'dead' | 'abandoned';
  startedAt: number;
  endedAt: number | null;
}

interface Relic {
  id: string;
  name: string;
  description: string;
  effect: 'hint_once' | 'negate_wrong_once' | 'shop_extra_choice' | 'max_hp_plus1';
}

interface MinedPhrase {           // "말 못 했던 표현" 수집함
  id: string;
  ko: string;                     // 필수
  ja: string | null;              // 나중에 채워도 됨
  note: string;
  createdAt: number;
  cardId: string | null;          // 카드로 변환되면 연결
}

interface Profile {
  dailyNewLimit: number;          // 기본 15
  unlockedThemes: Theme[];
  ascension: number;              // 0부터
  restTokens: number;             // 주 2개 지급, 연속 기록 보호용
  streak: number;
  ownedRelicIds: string[];        // 메타 해금 유물
}
```

## 정답 판정 규칙 (core/answer.ts)
- 입력과 정답을 `wanakana.toHiragana` 로 변환 후 공백·구두점(、。！？…ー 제외 없이 기호류) 제거해서 비교.
- `ja` 원문과 정확히 일치해도 정답.
- 판정 결과 → FSRS 등급:
  - 정답, 힌트 없음 → `good`
  - 정답 + 힌트 사용, 또는 근접 오답(정규화 후 길이 8 이상이고 편집 거리 1) → `hard`
  - 그 외 → `again`
- `easy` 는 사용하지 않음.
- 오답 시: 정답 + 음성 재생 후 **정답을 한 번 따라 입력해야 다음으로 진행** (등급은 바뀌지 않음).

## 런 규칙 (core/run.ts)
- 기본 maxHp 5. `again` 1회당 HP -1. 휴식처 HP +2 (maxHp 초과 불가).
- HP 0 → status `dead`. 이미 답한 카드의 FSRS 기록은 유지, 못 푼 카드는 due 상태로 남음.
- 보스 클리어 → `won`.
- 하루 1런 정상 보상. 같은 날 추가 런은 연습 모드(보상 절반).

## 맵 생성 규칙 (core/mapgen.ts)
입력: 오늘 due 카드, 신규 후보(introducedAt=null, 해금 테마), 리치 카드(lapses ≥ 4), seed.
- due 카드를 retrievability 오름차순 정렬 후 **층 단위 배치** (층당 5~8장).
- 층 수 = ceil(due / 7) + 2, 최소 4층, 최대 15층.
- 각 일반 층은 2~3개 노드. 노드 타입은 batch를 바꾸지 않고 **보정만** 바꾼다:
  - `battle`: 층 batch 그대로
  - `elite`: 층 batch + 리치 카드 2장, 보상 2배
  - `rest`: 층 batch 그대로 + 클리어 시 HP +2
  - `event`: 층 batch 그대로 + 무작위 효과 1개
- `shop` 층은 경로 중간에 **전체 폭 고정 층**으로 1회 배치 (모든 경로가 통과). 신규 카드 3장 중 선택해 구매, 구매한 카드는 즉시 학습 전투 진행. 하루 구매 상한 = dailyNewLimit.
- `boss` 층은 마지막 고정 층. 해당 런 메인 테마 카드 연속 출제, 오답 시 HP -2.
- 같은 seed → 같은 맵 (결정적).
- **필수 테스트**: 시작~보스의 모든 경로에서 due 카드 전체가 정확히 한 번씩 등장하는지 검증.

## 메타 진행 (core/meta.ts)
- 캐릭터 레벨 = `fsrs.stability ≥ 21` 인 카드 수 기반 (예: 20장당 1레벨).
- 테마 해금 순서: konbini → cafe → restaurant → directions → friends_plan → smalltalk → consult. 이전 테마 카드의 70%가 stability ≥ 7 이면 다음 해금.
- 수집함 표현을 카드로 변환해 stability ≥ 21 달성 시 희귀 유물 1개 해금.
- 승천: 1 = 힌트 금지, 2 = 익숙한 카드(stability ≥ 30)에 제한 시간 15초, 3 = 음성 입력만 (Phase 4 이후).

## 화면 흐름
Home(오늘 복습 수, 레벨, 런 시작, 수집함 바로가기)
→ Map(분기 선택) → Battle / Shop / Rest
→ Reward(유물·골드 3택 1)
→ … → Boss → RunResult(맞춘 수, 레벨 변화, 다음 복습 예정량)
별도: Collection(도감), Mining(표현 수집 입력, 한국어만 적어도 저장 가능), Settings(신규 한도, JSON 내보내기/가져오기)

UI 문구는 한국어. 모바일 우선(폭 375px 기준). 이모지 사용 금지.

## 진행 단계
- **Phase 1 — 학습 코어 (게임 없음)**: Dexie 스키마, seed 카드 50장(konbini 테마), FSRS 래퍼, 정답 판정, 단순 복습 화면, TTS. core 전부 테스트. 학습 로직이 게임보다 먼저다.
- **Phase 2 — 로그라이크 레이어**: mapgen, run, relics, Map/Battle/Shop/Rest/Reward/RunResult 화면.
- **Phase 3 — 수집·메타·배포**: Mining, Collection, 메타 진행, PWA, GitHub Pages 배포.
- **Phase 4 — 음성·LLM**: Web Speech 인식(ja-JP), Claude 첨삭·의미 판정·보스 대화. API 키는 코드·저장소에 절대 넣지 않음. 기본은 사용자가 설정에 넣은 본인 키로 브라우저에서 직접 호출(키는 그 기기에만 저장, 앱 전용 키와 콘솔 사용 한도 권장, 기기당 하루 호출 상한). 키를 기기에 두지 않으려면 Cloudflare Workers 경유 방식도 선택 가능.

## 작업 규칙
- 한 번에 한 Phase, 그 안에서도 작은 단위로 커밋. 커밋 메시지는 한국어 한 줄.
- core는 순수 함수 + 테스트 먼저. 테스트 통과 전 다음 작업 금지.
- 시드 문장은 자연스러운 구어체로, 각 카드에 readings 최소 1개. 생성한 문장은 사용자가 검수할 수 있게 별도 JSON 파일로 분리.
- 명세와 충돌하거나 모호한 부분은 추측하지 말고 질문.
