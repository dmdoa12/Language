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
