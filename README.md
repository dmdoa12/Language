# 일본어 회화 로그라이크

한국어 상황을 보고 일본어로 말하는(입력하는) 회화 복습 게임. 복습 일정은 FSRS(ts-fsrs)가 정하고,
그날 복습할 표현은 맵의 어느 경로로 가도 전부 나온다. 명세는 `CLAUDE.md`.

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

## 데이터

학습 기록은 브라우저 IndexedDB 에만 저장된다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에
설정 → JSON으로 내보내기로 백업한다.

## 시드 문장 검수

`src/data/seed/*.json` 에 테마별 문장이 있다. `ja`(정답 표기), `readings`(허용 정답, 히라가나·장음 ー),
`ko`, `situation`(문제로 표시되는 상황)을 고치면 된다. `npm test` 가 형식과 오타(가나 부분 불일치)를 검사한다.

## AI 채점·대화 (선택, Cloudflare Worker)

AI 기능이 없어도 앱은 그대로 동작한다. 연결하면:

- 정답과 다르게 답했을 때 Claude 가 뜻을 판정한다. 표기만 다르면(음성 인식 결과 등) 정답(good),
  뜻이 같은 다른 자연스러운 표현이면 hard, 그 외는 기존 판정. 첨삭 코멘트가 함께 나온다.
- 보스를 이기면 메인 테마 상황으로 3~4마디 보너스 대화를 할 수 있다. 오늘 복습한 표현을 쓰면 골드 보너스.
  복습 기록(FSRS)과 체력에는 영향이 없다.

Claude API 키는 Worker 의 비밀 변수에만 두고 앱(브라우저)에는 넣지 않는다.
앱에는 Worker 주소와 본인만 아는 접속 암호만 저장한다.

### 배포

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
- 모델은 `JUDGE_MODEL`(채점·첨삭, 기본 `claude-haiku-5-5`)과 `CHAT_MODEL`(보스 대화, 기본 `claude-opus-5-5`)로 바꿀 수 있다.
  보스 대화는 거절 시 서버 측 폴백(`fallbacks: "default"`)을 쓴다.

그다음 앱의 설정 → AI 채점·대화에 Worker 주소와 접속 암호를 넣고 "연결 확인 후 저장".

### 음성 입력

입력창 옆 "말하기" 버튼(브라우저 음성 인식, ja-JP). Chrome(안드로이드·PC)과 iPhone Safari 에서 동작하고,
인식 결과가 입력창에 채워지면 확인을 누른다. 한자 표기 차이는 AI 판정이 연결돼 있으면 정답으로 인정된다.
