# 일본어 회화: 일본에서의 하루 (프로젝트 명세)

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
6. 그날 복습 대상 카드는 **그날 하루의 장면에 전부, 정확히 한 번씩 등장**해야 한다.
7. 틀려도 **게임상 불이익은 없다**. 학습 기록(FSRS)만 정직하게 남는다.

## 기술 스택
- Vite + React + TypeScript (strict)
- 상태: Zustand / 저장: Dexie (IndexedDB)
- 복습: ts-fsrs / 가나 정규화: wanakana / 읽기 분석(채점용): kuromoji
- 테스트: Vitest
- PWA: vite-plugin-pwa / 배포: GitHub Pages (GitHub Actions)
- TTS: Web Speech API `speechSynthesis` (lang `ja-JP`)
- 위 목록 외 라이브러리는 추가 전에 반드시 물어볼 것.

## 폴더 구조
```
src/
  core/          # 순수 함수만. UI·DB 의존 금지. 전부 테스트 대상
    fsrs.ts        # ts-fsrs 래퍼, 등급 산정
    answer.ts      # 정답 판정 (정규화, 혼용 표기, 읽기 비교, 근접 오답)
    dayplan.ts     # 하루 장면 구성
    day.ts         # 하루 진행 상태 전이 (줄 답변, 장면 결과)
    garden.ts      # 정원 단계 계산 (씨앗·새싹·잎·꽃·시듦)
    structure.ts   # 문장 구조 시각화 (형태소 → 덩어리·품사·후리가나·문형 위치)
    meta.ts        # 레벨·해금·연속 기록 계산
    llmPrompts.ts  # (선택) Claude 판정·대화 프롬프트와 검증
  db/            # Dexie 스키마, 리포지토리
  store/         # Zustand
  api/           # kuromoji 읽기 분석, (선택) Claude 호출
  ui/
    screens/     # Home, Day(장면 진행), DaySummary, Garden(도감), Mining, Settings, QuickReview, EveningChat
    components/  # SentenceStructure 등
  data/seed/     # 초기 카드 JSON (테마별)
tests/
worker/          # (선택) Cloudflare Worker 경유 Claude 호출
```

## 데이터 스키마
```ts
type Theme = 'konbini' | 'cafe' | 'restaurant' | 'directions' | 'friends_plan' | 'smalltalk' | 'consult';

interface StudyCard {
  id: string;
  ja: string;                 // 표준 정답 문장 (한자 포함)
  readings: string[];         // 허용 정답 (전부 히라가나). 최소 1개
  ko: string;                 // 한국어 의미
  situation: string;          // 한국어 상황 설명 (장면에서 문제로 표시)
  theme: Theme;
  grammarTags: string[];      // 예: ['〜てしまう']
  source: 'deck' | 'mined';
  fsrs: import('ts-fsrs').Card;
  introducedAt: number | null; // null = 아직 안 배움 (하루 장면에서 처음 배울 때 설정)
}

interface ReviewLogEntry {
  id: string;
  cardId: string;
  dayId: string | null;       // 하루 진행 중이면 DayLog id, 빠른 복습이면 null
  rating: 'again' | 'hard' | 'good';
  input: string;
  hintUsed: boolean;
  elapsedMs: number;
  answeredAt: number;
  fsrsLog: import('ts-fsrs').ReviewLog;
}

interface SceneLine {
  cardId: string;
  isNew: boolean;              // 오늘 처음 배우는 표현 (먼저 보여주고 따라 말한 뒤 출제)
}

interface Scene {
  id: string;
  theme: Theme;                // 장소 (편의점, 카페 ...)
  part: number;                // 같은 장소가 길면 나눈 순번 (1부터)
  parts: number;
  lines: SceneLine[];
}

interface DayLineResult {
  cardId: string;
  rating: 'again' | 'hard' | 'good';
  firstTry: boolean;           // 한 번에 말했는가 (good)
}

interface DayLog {               // 하루 기록 (runs 대체)
  id: string;
  date: string;                // YYYY-MM-DD (Asia/Seoul)
  scenes: Scene[];
  results: DayLineResult[];    // 답한 순서대로. 이어하기 위치 = results.length
  status: 'active' | 'done';
  startedAt: number;
  endedAt: number | null;
  stagesAtStart: Record<string, number>; // 하루 시작 때 정원 단계 (오늘 자란 식물 계산용)
  eveningChatDone?: boolean;   // (선택) 하루 마무리 AI 대화
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
  challenge: {                    // 도전 옵션 (각각 켜고 끔)
    noHint: boolean;              // 힌트 없이
    timeLimit: boolean;           // 익숙한 문장(stability ≥ 30)은 15초 안에
    voiceOnly: boolean;           // 말로만 답하기
  };
  restTokens: number;             // 주 2개 지급, 연속 기록 보호용
  streak: number;
}
```

## 정답 판정 규칙 (core/answer.ts)
- 입력과 정답을 정규화(NFKC, 숫자→한자 숫자, 가타카나→히라가나(장음 ー 유지), 로마자→가나, 공백·구두점·기호 제거)해서 비교.
- 정답으로 보는 경우:
  - `ja` 원문 또는 `readings` 중 하나와 일치
  - 한자·가나 혼용: `ja` 의 한자를 그대로 쓰거나 해당 읽기의 가나로 바꿔 쓴 조합 (`レジ袋いちまい…`)
  - kuromoji 사전이 준비됐으면: 입력의 읽기가 `readings` 또는 `ja` 의 읽기와 일치 (다른 한자 표기, 음성 인식 결과)
- (선택) AI 연결 시 위에서 정답이 아닐 때만 의미 판정: 표기만 다름 → good, 뜻이 같은 다른 자연스러운 표현 → hard.
- 판정 결과 → FSRS 등급:
  - 정답, 힌트 없음 → `good`
  - 정답 + 힌트 사용, 또는 근접 오답(정규화 후 길이 8 이상이고 편집 거리 1) → `hard`
  - 그 외 → `again`
- `easy` 는 사용하지 않음.
- 오답 시: 정답 + 음성 재생 후 **정답을 한 번 따라 입력해야 다음으로 진행** (등급은 바뀌지 않음).

## 하루 구성 (core/dayplan.ts)
입력: 오늘 due 카드(retrievability 오름차순), 신규 후보(introducedAt=null, 해금 테마, 오늘 남은 신규 한도만큼, 덱 순서).
- 장면 = 장소(테마) 단위. 장소 순서는 THEME_ORDER (하루 흐름: 아침 편의점 → 카페 → 식당 → …).
- 각 장소 장면에는 그 테마의 due 카드(잊기 쉬운 순) 뒤에 그 테마의 신규 카드가 온다.
- 한 장면은 최대 8줄. 넘으면 같은 장소를 여러 장면으로 나눈다 (`편의점 1/2`).
- 수집함 카드도 자기 테마 장면에 들어간다.
- 결정적: 같은 입력 → 같은 하루.
- **필수 테스트**: due 카드 전체가 정확히 한 번씩, 신규 카드는 한도 이내로 등장.

## 하루 진행 (core/day.ts)
- 줄마다: 신규면 먼저 표현을 보여주고 따라 입력 → 출제. 한국어 상황·의미를 보고 일본어로 답한다.
- 오답이어도 진행에 불이익은 없다 (상대가 못 알아들은 반응 + 정답 따라 말하기).
- 장면 결과: 매끄러움 = 한 번에 말한(good) 줄 비율. 표시만 하고 보상·벌칙 없음.
- 모든 장면을 마치면 하루 완료(DayLog.status = done). 중간에 닫아도 이어서 진행.
- 하루 1회. 완료 후 학습 단계로 곧 다시 due 가 되는 카드는 홈의 "잊기 전에 한 번 더"(빠른 복습)로.
- 이미 오늘 다른 경로(빠른 복습)로 복습해 due 가 아니게 된 카드는 FSRS 에 다시 기록하지 않는다.
- (선택) 하루 완료 후 AI 가 연결돼 있으면 마지막 장소 상대와 자유 대화(최대 4마디). FSRS 무관.

## 메타 진행 (core/meta.ts, core/garden.ts)
- 캐릭터 레벨 = `fsrs.stability ≥ 21` 인 카드 수 기반 (20장당 1레벨).
- 장소(테마) 해금 순서: konbini → cafe → restaurant → directions → friends_plan → smalltalk → consult. 이전 테마 덱 카드의 70%가 stability ≥ 7 이면 다음 해금 ("새 장소에 갈 수 있어요").
- 연속 기록: 복습한 날(서울 날짜)이 이어진 일수. 빈 날은 그 주의 휴식권(주 2개)으로 메운다.
- 정원(도감): 배운 표현 하나 = 식물 하나, 테마별 화단.
  - 단계: stability < 1 씨앗, ≥ 1 새싹, ≥ 7 잎, ≥ 21 꽃
  - 지금 기억 확률(retrievability) < 0.75 이면 시듦 (복습하면 회복)
  - 수집함에서 만든 표현은 특별한 꽃 모양
  - 식물을 누르면 문장, 뜻, 문장 구조, 기억 상태(유지 기간·확률·다음 복습일)
- 도전 옵션 (설정): 힌트 없이 / 익숙한 문장(stability ≥ 30) 15초 제한 / 말로만 답하기.

## 문장 구조 시각화 (core/structure.ts)
- kuromoji 형태소 결과를 덩어리(내용어 + 뒤따르는 조사·조동사)로 묶고 품사별 색으로 표시.
- 한자에는 후리가나(읽기).
- 카드의 문형 태그(〜てもらえますか 등)가 문장의 어느 부분인지 강조.
- 오답 시 내 답과 정답을 덩어리 단위로 나란히 보여 다른 부분을 표시.
- 사전이 준비되기 전에는 문장을 그대로 보여준다.

## 화면 흐름
Home(오늘의 하루: 장면 수·복습 수·새 표현 수, 레벨, 연속 기록, 하루 시작/이어하기)
→ Day(장면 진행: 장소·장면 n/m, 상황 → 말하기 → 판정 → 다음 줄)
→ 장면 사이: 장면 결과(매끄러움)
→ DaySummary(맞힌 수, 오늘 자란 식물, 레벨 변화, 내일 복습 예정량, (선택) 하루 마무리 대화)
별도: Garden(정원 = 도감), Mining(표현 수집 입력, 한국어만 적어도 저장 가능), Settings(신규 한도, 도전 옵션, 사전 상태, (선택) AI, JSON 내보내기/가져오기), 잊기 전에 한 번 더(빠른 복습)

UI 문구는 한국어. 모바일 우선(폭 375px 기준). 이모지 사용 금지.

## 진행 단계
- **Phase 1 — 학습 코어 (게임 없음)**: Dexie 스키마, seed 카드 50장(konbini 테마), FSRS 래퍼, 정답 판정, 단순 복습 화면, TTS. core 전부 테스트. 학습 로직이 게임보다 먼저다.
- **Phase 2 — 로그라이크 레이어** (Phase 5에서 교체됨): mapgen, run, relics, Map/Battle/Shop/Rest/Reward/RunResult 화면.
- **Phase 3 — 수집·메타·배포**: Mining, Collection, 메타 진행, PWA, GitHub Pages 배포.
- **Phase 4 — 음성·LLM**: Web Speech 인식(ja-JP), Claude 첨삭·의미 판정·보스 대화. API 키는 코드·저장소에 절대 넣지 않음. 기본은 사용자가 설정에 넣은 본인 키로 브라우저에서 직접 호출(키는 그 기기에만 저장, 앱 전용 키와 콘솔 사용 한도 권장, 기기당 하루 호출 상한). 키를 기기에 두지 않으려면 Cloudflare Workers 경유 방식도 선택 가능.
- **Phase 5 — 일본에서의 하루**: 로그라이크(맵·런·상점·보상·유물·체력·골드)를 하루 장면 진행으로 교체, 정원 도감, 문장 구조 시각화, 도전 옵션. 학습 코어(FSRS·채점·수집함·설정)는 유지.

## 작업 규칙
- 한 번에 한 Phase, 그 안에서도 작은 단위로 커밋. 커밋 메시지는 한국어 한 줄.
- core는 순수 함수 + 테스트 먼저. 테스트 통과 전 다음 작업 금지.
- 시드 문장은 자연스러운 구어체로, 각 카드에 readings 최소 1개. 생성한 문장은 사용자가 검수할 수 있게 별도 JSON 파일로 분리.
- 명세와 충돌하거나 모호한 부분은 추측하지 말고 질문.
