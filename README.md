# 일본에서의 하루

한국어 상황을 보고 일본어로 말하는(입력하는) 회화 복습 앱. 복습 일정은 FSRS(ts-fsrs)가 정한다.
명세는 `CLAUDE.md`.

- **오늘의 하루**: 오늘 복습할 표현과 새 표현을 장소별 장면(아침 편의점 → 카페 → …)으로 묶어 차례로 말한다.
  복습할 표현은 전부 정확히 한 번씩 나온다. 틀려도 불이익은 없고, 정답을 따라 말하고 넘어간다.
  장면이 끝나면 매끄러움(한 번에 말한 비율)을 보여준다.
- **정원**: 배운 표현 하나가 식물 하나. 기억이 유지되는 기간에 따라 씨앗 → 새싹 → 잎 → 꽃으로 자라고,
  복습할 때가 지나 기억할 확률이 떨어지면 시든다. 수집함에서 만든 표현은 특별한 꽃.
- **문장 구조**: 정답 문장을 덩어리별 품사 색, 한자 후리가나, 문형 위치 강조로 보여준다.
  틀렸을 때는 내 답과 정답을 덩어리 단위로 대조한다.
- **도전 옵션**(설정): 힌트 없이 / 익숙한 문장 15초 제한 / 말로만 답하기.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest (core 순수 함수, 시드 검증)
npm run build    # dist/ (PWA 포함)
```

## 배포 (GitHub Pages)

`main` 에 푸시(PR 머지)하면 `.github/workflows/deploy.yml` 이 테스트 → 빌드 → Pages 배포를 한다.
Actions 탭에서 수동 실행도 된다.

처음 한 번만 저장소 설정이 필요하다:
Settings → Pages → Build and deployment → Source 를 **GitHub Actions** 로 바꾼다.

배포 주소: `https://<사용자>.github.io/<저장소>/`. 휴대폰 브라우저에서 열고 "홈 화면에 추가"하면 앱처럼 쓸 수 있고
오프라인에서도 열린다.

## 채점

- 표준 문장(`ja`) 그대로, 또는 히라가나 읽기(`readings`)로 답하면 정답.
- 숫자(`1枚` = `一枚`)와 한자·가나 혼용(`レジ袋いちまい…`)도 같은 문장이면 정답.
- 일본어 분석 사전(kuromoji, 약 14MB)을 받은 뒤에는 입력을 읽기로 바꿔서도 비교한다. 다른 한자 표기나
  음성 인식 결과(`これ暖めて…` = `これ、温めて…`)도 같은 발음의 같은 문장이면 정답. 사전은 앱이 뜬 뒤
  백그라운드에서 한 번 받고 오프라인 캐시에 남는다. 받기 전에는 위 두 규칙으로만 채점한다(설정에서 상태 확인).
- 사전 파일은 저장소에 넣지 않고 빌드 때 `node_modules/kuromoji/dict` 에서 `dist/dict/` 로 복사한다.

## 데이터

학습 기록은 브라우저 IndexedDB 에만 저장된다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에
설정 → JSON으로 내보내기로 백업한다.

## 시드 문장 검수

`src/data/seed/*.json` 에 테마별 문장이 있다. `ja`(정답 표기), `readings`(허용 정답, 히라가나·장음 ー),
`ko`, `situation`(문제로 표시되는 상황)을 고치면 된다. `npm test` 가 형식과 오타(가나 부분 불일치)를 검사한다.

## AI 채점·대화 (선택)

AI 기능이 없어도 앱은 그대로 동작한다. 연결하면:

- 정답과 다르게 답했을 때 Claude 가 뜻을 판정한다. 표기만 다르면(다른 한자, 음성 인식 결과 등) 정답(good),
  뜻이 같은 다른 자연스러운 표현이면 hard, 그 외는 기존 판정. 첨삭 코멘트가 함께 나온다.
  (숫자·한자·가나 혼용은 AI 없이도 정답 처리된다.)
- 하루를 마치면 마지막 장소의 상대와 하루 마무리 대화(최대 4마디)를 할 수 있다. 복습 기록(FSRS)에는 영향이 없다.

모델: 채점·첨삭 `claude-haiku-5-5`, 하루 마무리 대화 `claude-opus-5-5`(거절 시 서버 측 폴백 `fallbacks: "default"`).

### 방법 1: API 키 직접 (기본, 서버 불필요)

1. [Anthropic 콘솔](https://console.anthropic.com)에서 **이 앱 전용 API 키**를 새로 만든다.
2. 콘솔의 Limits(사용 한도)에서 **월 한도**를 낮게 건다(예: 5달러). 키가 새더라도 피해가 그 금액에서 멈춘다.
3. 앱 설정 → AI 채점·대화 → "API 키 직접"에 키를 넣고 "연결 확인 후 저장".

키는 그 기기 브라우저 저장소에만 남고 Claude API(api.anthropic.com)로만 보내진다. 코드·저장소·백업 파일에는
들어가지 않는다. 앱은 기기당 하루 300회까지만 호출한다. 공용 기기에는 넣지 않는다.

### 방법 2: Cloudflare Worker 경유 (키를 기기에 두지 않음)

Claude API 키는 Worker 의 비밀 변수에만 두고, 앱에는 Worker 주소와 본인만 아는 접속 암호만 저장한다.

```bash
cd worker
npm install
npx wrangler login                          # Cloudflare 계정 로그인 (무료 플랜 가능)
npx wrangler secret put ANTHROPIC_API_KEY   # Claude API 키
npx wrangler secret put ACCESS_KEY          # 앱 설정에 넣을 접속 암호 (길고 임의로)
npx wrangler deploy                         # https://jp-talk-worker.<계정>.workers.dev
```

- `wrangler.toml` 의 `ALLOWED_ORIGINS` 는 앱이 배포된 주소(`https://<사용자>.github.io`)다.
- 하루 호출 상한(`DAILY_LIMIT`, 기본 300)을 쓰려면 KV 를 만들고 `wrangler.toml` 의 주석을 푼다:
  `npx wrangler kv namespace create USAGE`
- 모델은 `JUDGE_MODEL`, `CHAT_MODEL` 로 바꿀 수 있다.

그다음 앱 설정 → AI 채점·대화 → "Worker 서버"에 주소와 접속 암호를 넣고 "연결 확인 후 저장".

### 음성 입력

입력창 옆 "말하기" 버튼(브라우저 음성 인식, ja-JP). Chrome(안드로이드·PC)과 iPhone Safari 에서 동작하고,
인식 결과가 입력창에 채워지면 확인을 누른다. 한자 표기 차이는 AI 판정이 연결돼 있으면 정답으로 인정된다.
