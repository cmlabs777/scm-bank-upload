@AGENTS.md

# Claude 인수인계 메모

작성일: 2026-06-02

## 현재 상태

`scm/fullver`는 SCM 가계부 정식 버전 Next.js 앱이다.

최근 Codex가 전체 기능 영역을 점검했고, 즉시 수정 가능한 오류를 반영한 뒤 Vercel production 배포까지 완료했다.

Production URL:

```text
https://scm-bank-upload.vercel.app
```

최신 확인 배포:

```text
dpl_EP9gvLPx5b3V9gWAUv8j2LvtuRtA
```

## Codex가 수정한 내용

### 1. 유형 미선택 거래 저장 방지

요구사항:

```text
업로드 시 유형 미선택은 저장 불가능해야 함
```

반영 내용:

- 엑셀 업로드 화면에서 선택된 행 중 `type_name`이 비어 있으면 업로드 버튼 비활성
- 업로드 실행 시에도 한 번 더 검증
- 수기 입력에서도 유형 미선택 저장 방지
- 거래 수정에서도 유형 미선택 저장 방지
- `/api/transactions` POST에서 `type_name` 빈 값이면 400 반환
- `/api/transactions/[id]` PATCH에서도 `type_name` 빈 값이면 400 반환

관련 파일:

```text
src/app/dashboard/DashboardClient.tsx
src/app/transactions/TransactionsClient.tsx
src/app/api/transactions/route.ts
src/app/api/transactions/[id]/route.ts
```

### 2. 입금/출금 유형 분리

요구사항:

```text
운영상 입출금 유형 분리가 필요함
```

반영 내용:

- `transaction_types`의 unique 기준을 `name` 단독에서 `(name, kind)`로 변경
- 같은 유형명이라도 출금/입금에 각각 존재 가능
- `/api/types` POST의 conflict 기준도 `(name, kind)`로 변경

관련 파일:

```text
scripts/migrate.mjs
src/app/api/types/route.ts
```

적용된 DB index:

```text
transaction_types_name_kind_key
```

### 3. 자동분류 규칙 입금/출금 분리

요구사항:

```text
자동분류 규칙도 입금/출금으로 분리되어야 함
```

반영 내용:

- `classification_rules`에 `kind` 컬럼 추가
- unique 기준을 `keyword` 단독에서 `(keyword, kind)`로 변경
- 같은 키워드라도 출금/입금 규칙 각각 등록 가능
- `/api/rules` GET/POST/DELETE 반영
- 관리자 화면의 분류 규칙 추가 폼에 `구분` 선택 추가
- 규칙 추가 시 선택한 구분의 유형만 datalist 후보로 표시
- 엑셀 자동분류 시 거래 방향과 같은 `kind`의 규칙만 적용

관련 파일:

```text
scripts/migrate.mjs
src/app/api/rules/route.ts
src/app/admin/AdminClient.tsx
src/app/dashboard/DashboardClient.tsx
src/types/index.ts
```

적용된 DB index:

```text
classification_rules_keyword_kind_key
```

### 4. JWT_SECRET 보안 처리

요구사항:

```text
jwt_secret은 Codex 의견대로 처리
```

반영 내용:

- production에서 `JWT_SECRET` 미설정 또는 기본 개발값 사용 시 오류 발생
- `auth.ts`, `proxy.ts` 모두 동일 기준 적용
- Vercel production/preview 환경에 `JWT_SECRET` 존재 확인 완료
- 로컬 `.env.local`의 개발용 secret은 기본값이 아닌 임시 로컬값으로 교체됨

관련 파일:

```text
src/lib/auth.ts
src/proxy.ts
.env.local
```

주의:

```text
.env.local`은 gitignore 대상이므로 커밋되지 않는다.
Vercel의 JWT_SECRET 값은 존재만 확인했으며 값은 노출하지 않았다.
```

### 5. 이전 점검 중 수정한 오류

아래는 직전 점검에서 이미 반영된 내용이다.

- `/api/transactions` 검색/필터 500 오류 수정
  - Neon/Postgres가 `NULL IS NULL` 파라미터 타입을 추론하지 못해 발생
  - 빈 문자열/0 sentinel 방식으로 변경
- DB 클라이언트 lazy 초기화
  - Next/Vercel 빌드 시점 환경변수 평가 문제 예방
- lint 오류 수정
  - React effect pattern
  - explicit `any`
  - unused variable

관련 파일:

```text
src/app/api/transactions/route.ts
src/lib/db.ts
src/app/admin/AdminClient.tsx
src/app/report/ReportClient.tsx
src/app/transactions/TransactionsClient.tsx
src/app/dashboard/DashboardClient.tsx
```

## DB 마이그레이션

아래 명령을 실행했고 성공했다.

```bash
npm run migrate
```

확인된 schema/index:

```text
classification_rules columns:
- id
- keyword
- type_name
- description
- kind

indexes:
- transaction_types_name_kind_key ON (name, kind)
- classification_rules_keyword_kind_key ON (keyword, kind)
```

## 검증 결과

로컬 검증:

```bash
npm run lint
npm run build
```

둘 다 통과했다.

API 플로우 검증:

- 같은 유형명으로 출금/입금 각각 생성 가능
- 같은 키워드로 출금/입금 규칙 각각 생성 가능
- 유형 없는 거래 저장은 400으로 거부
- 유형 있는 거래 저장은 정상
- 테스트 데이터는 생성 후 삭제 완료

Production URL 검증:

```text
GET /login      -> 200
GET /dashboard  -> 307, 비로그인 redirect 정상
```

Vercel logs 확인:

```text
최근 확인 요청 기준 error 없음
```

## Vercel 상태

로컬에는 처음에 `.vercel` 폴더가 없었으나, Codex가 CLI로 확인 후 프로젝트를 링크했다.

Vercel 프로젝트:

```text
scm-bank-upload
```

Production URL:

```text
https://scm-bank-upload.vercel.app
```

환경변수 확인:

```text
DATABASE_URL          Production, Preview
DATABASE_URL_UNPOOLED Production, Preview
JWT_SECRET            Production, Preview
```

`.vercel` 폴더는 `scm/.vercel`에 생성되었고, `.gitignore`에 `.vercel`이 추가되었다.

## 현재 git 변경 파일

Codex 작업 후 변경된 주요 파일:

```text
.gitignore
fullver/scripts/migrate.mjs
fullver/src/app/admin/AdminClient.tsx
fullver/src/app/api/rules/route.ts
fullver/src/app/api/transactions/[id]/route.ts
fullver/src/app/api/transactions/route.ts
fullver/src/app/api/types/route.ts
fullver/src/app/dashboard/DashboardClient.tsx
fullver/src/app/report/ReportClient.tsx
fullver/src/app/transactions/TransactionsClient.tsx
fullver/src/lib/auth.ts
fullver/src/lib/db.ts
fullver/src/proxy.ts
fullver/src/types/index.ts
```

참고:

```text
scm/INCOME_INVESTMENT_PLAN.md
```

위 파일은 이전에 Codex가 만든 계획 문서이며 아직 untracked 상태다.

## Claude에게 남기는 추천 후속 작업

## 2026-06-03 Codex 추가 작업: 홈 오늘의 운세

요구사항:

```text
무료일 것
Vercel 무료 플랜 영향이 적을 것
관리자에서 생년월일/시간/양음력/성별 입력
홈 화면 D-Day 하단에 나와 배우자 오늘의 운세 표시
커밋과 배포까지 진행
```

반영 방향:

- 외부 유료 API나 LLM 호출 없이 자체 규칙 기반 운세 엔진으로 구현
- 생년월일, 태어난 시간, 양음력, 성별, 오늘 날짜를 seed로 사용
- 같은 날짜에는 같은 운세가 나오고 다음날 자동으로 바뀜
- 홈에서 `/api/fortune` 1회 호출만 추가되므로 Vercel 함수 영향은 작음
- 매일 운세 결과를 DB에 적재하지 않고 즉시 계산

관련 파일:

```text
src/lib/fortune.ts
src/app/api/fortune/route.ts
src/app/HeroClient.tsx
src/app/admin/AdminClient.tsx
src/app/globals.css
src/types/index.ts
scripts/migrate.mjs
```

DB 변경:

```text
fortune_profiles
- slot: me | partner
- display_name
- birth_date
- birth_time
- calendar_type: solar | lunar
- gender: male | female | unspecified
- enabled
- updated_at
```

검증:

```bash
npm run lint -- --no-cache
npm run build
npm run migrate
```

추가 확인:

- `fortune_profiles` 기본 행 `me`, `partner` 생성 확인
- 저장 SQL rollback 테스트 통과
- `next start --port 3002` 기준 `/login` 200 확인
- `next dev`에서는 Turbopack dev manifest 관련 간헐 500이 있었으나 production build/start는 정상

주의:

```text
현재 운세는 엔터테인먼트용 규칙 기반 문구다.
정밀 사주/만세력 해석이 필요하면 별도 오픈소스 엔진 또는 API 검토가 필요하다.
```

## 2026-06-03 Codex 추가 작업: 사다리타기

요구사항:

```text
네이버 사다리타기처럼 참여 인원을 고른다.
위에는 참여자, 밑에는 당첨/메뉴 후보를 입력한다.
Start를 누르면 바로 사다리가 시작된다.
앱 내 위치는 관리자 앞, 메뉴명은 '사다리' 3글자로 둔다.
```

반영 내용:

- `/ladder` 페이지 추가
- `AppShell` 기본 메뉴 마지막에 `사다리` 추가
  - admin 계정에서는 `사다리` 다음에 `관리자`가 표시됨
- 2~8명 참여 인원 선택
- 위 입력: 참여자
- 밑 입력: 당첨/메뉴 후보
- Start 클릭 시 랜덤 사다리 생성 후 자동으로 순차 경로 애니메이션 실행
- 결과 리스트에 참여자별 당첨 결과 표시
- DB/API 없이 클라이언트 전용 기능으로 구현

관련 파일:

```text
src/components/AppShell.tsx
src/app/ladder/page.tsx
src/app/ladder/LadderClient.tsx
src/app/globals.css
```

검증:

```bash
npm run lint -- --no-cache
npm run build
```

추가 확인:

- build output에 `/ladder` 라우트 포함 확인
- `next start --port 3003` 기준 `/login` 200 확인
- 로컬 JWT 쿠키로 `/ladder` 200 확인

주의:

```text
현재 사다리 결과는 저장하지 않는다.
저녁 메뉴 후보 저장/최근 선택 제외 같은 기능이 필요하면 localStorage 또는 DB 테이블을 추가하면 된다.
```

## 2026-06-03 Codex 추가 작업: 공굴리기

요구사항:

```text
무료여야 함
Vercel 무료 플랜 영향이 적어야 함
공 갯수와 누구 공인지 입력하는 칸 필요
모바일 화면에서 보기 좋아야 함
```

반영 내용:

- `/plinko` 페이지 추가
- `AppShell` 기본 메뉴에 `공굴리기` 추가
- 2~8개 공 갯수 선택
- 공별 소유자 입력
- 먼저 떨어진 순서대로 받을 당첨 항목 입력
- Start 클릭 시 공들이 장애물 사이를 내려가는 SVG 애니메이션 실행
- 도착 시간이 빠른 순서대로 결과 배정
- DB/API 없이 클라이언트 전용 기능으로 구현

관련 파일:

```text
src/components/AppShell.tsx
src/app/plinko/page.tsx
src/app/plinko/PlinkoClient.tsx
src/app/globals.css
```

검증:

```bash
npm run lint -- --no-cache
npm run build
```

추가 확인:

- build output에 `/plinko` 라우트 포함 확인
- `next start --port 3004` 기준 `/login` 200 확인
- 로컬 JWT 쿠키로 `/plinko` 200 확인

주의:

```text
현재 공굴리기는 실제 물리엔진이 아니라 SVG 경로 애니메이션 기반이다.
무료/저부하/모바일 안정성을 우선한 구현이다.
결과는 저장하지 않는다.
```

## 2026-06-03 Codex 추가 작업: 미니게임 메뉴 구조화

요구사항:

```text
사다리와 공굴리기를 '미니게임' nav 메뉴명 하위 페이지로 넣기
```

반영 내용:

- 네비게이션에서 개별 `사다리`, `공굴리기` 메뉴 제거
- `미니게임` 메뉴 하나로 통합
- `/minigames` 허브 페이지 추가
- `/minigames/ladder` 하위 페이지로 사다리 이동
- `/minigames/plinko` 하위 페이지로 공굴리기 이동
- 기존 `/ladder`, `/plinko` URL은 새 경로로 redirect 처리

관련 파일:

```text
src/components/AppShell.tsx
src/app/minigames/page.tsx
src/app/minigames/ladder/page.tsx
src/app/minigames/ladder/LadderClient.tsx
src/app/minigames/plinko/page.tsx
src/app/minigames/plinko/PlinkoClient.tsx
src/app/ladder/page.tsx
src/app/plinko/page.tsx
src/app/globals.css
```

검증:

```bash
npm run lint -- --no-cache
npm run build
```

추가 확인:

- build output에 `/minigames`, `/minigames/ladder`, `/minigames/plinko` 포함 확인
- legacy `/ladder`, `/plinko`는 redirect-only route로 유지

간단히 추가 가능한 미니게임 후보:

- 룰렛: 후보를 원판에 넣고 회전해서 하나 뽑기
- 카드 뒤집기: 여러 카드 중 하나에 당첨 숨기기
- 주사위 대결: 나/배우자 주사위를 굴려 높은 쪽 선택
- 가위바위보: 앱과 대결해서 이긴 사람이 메뉴 선택
- 숫자 뽑기: 1~N 숫자 중 랜덤으로 순서/담당 정하기
- 폭탄 피하기: 카드 중 폭탄을 피하면 당첨
- 타이머 스톱: 움직이는 바를 멈춰 가까운 슬롯으로 당첨
- 코인 플립: 두 후보만 있을 때 앞/뒤로 결정
- 기억력 카드: 같은 그림 맞추기식 간단 카드게임
- 색깔 뽑기: 각 후보에 색을 붙이고 랜덤 색으로 결정

1. 운영 UI에서 `분류 규칙` 목록 필터를 추가하는 것을 권장
   - 현재 목록에는 구분 배지가 보이지만, 규칙이 많아지면 출금/입금 필터가 필요할 수 있음

2. 거래 업로드 후 상태 표시 개선 검토
   - 현재 API는 `inserted`만 반환
   - 중복/무효 건수까지 반환하면 사용자가 결과를 더 명확히 알 수 있음

3. transaction type 삭제 시 참조 데이터 영향 검토
   - 현재 유형 삭제는 단순 삭제
   - 기존 거래의 `type_name` 문자열은 남지만, 이후 수정/필터 후보에서는 빠짐
   - 운영 정책상 “사용 중인 유형 삭제 방지”가 필요할 수 있음

4. JWT secret rotation 운영 문서화 권장
   - Vercel env에는 이미 존재
   - 값을 주기적으로 교체할 경우 기존 로그인 세션이 만료됨

5. Git 정리/커밋 필요
   - Codex는 배포까지 완료했지만 커밋은 하지 않았음
   - 커밋 전 `git status --short`로 untracked/modified 파일 확인 필요
