# SCM Bank Upload

카카오뱅크 거래내역 엑셀을 브라우저에서 읽고, 출금 거래만 검수한 뒤 Google Sheet에 적재하는 개인용 정적 HTML 도구입니다.

## 핵심 원칙

- 이 프로젝트는 `scm` 폴더 안에서만 관리합니다.
- 원본 엑셀 파일은 저장하지 않습니다.
- 최종 데이터는 Google Sheet에만 적재합니다.
- GitHub에는 private repository로 분리해서 올립니다.
- `.xlsx`, `.xls`, `.csv`, 환경 설정 파일은 커밋하지 않습니다.

## 파일 구조

```text
scm/
  index.html
  styles.css
  app.js
  parser.js
  scripts/
    verify-excel.js
  apps-script/
    Code.gs
  WORK_ORDER.md
  README.md
```

## 로컬 검증

```bash
npm run check
npm run verify:excel -- "카카오뱅크_거래내역_N9107412989_2026053121165067.xlsx"
```

검증 스크립트는 엑셀 파일을 읽어 출금 거래 수, 월별 건수, 첫 거래 변환 결과를 출력합니다. 원본 파일은 수정하거나 저장하지 않습니다.

## 배포 메모

HTML 페이지는 GitHub를 통한 URL로만 엽니다. Apps Script Web App과 통신할 때는 GitHub Pages와 Apps Script의 origin이 다르기 때문에 CORS 제약을 고려해야 합니다.

현재 Apps Script Web App URL:

```text
https://script.google.com/macros/s/AKfycbwcNeBJ1O0jvJ2rpxMsWKRQBhds5088RSVtFlHBSljHICo5C376gB2OWCmavV2oT9Vr/exec
```

초기 구현은 다음 흐름을 기준으로 합니다.

1. GitHub Pages에서 `index.html` 접속
2. Apps Script Web App URL 설정
3. `gas 유형` 탭에서 유형과 자동분류 규칙 조회
4. 카카오뱅크 엑셀 업로드
5. 출금 거래 검수
6. Google Sheet `출금내역` 탭 raw data 하단에 적재

## Google Sheet 탭

- `출금내역`: 출금 raw data 적재 대상
- `gas 유형`: 유형 목록과 자동분류 규칙 저장

`gas 유형` 탭 권장 구조:

| A | B | C | D | E |
|---|---|---|---|---|
| 유형 |  | 키워드 | 추천유형 | 설명 |
| 생활비 |  | 쿠팡 | 생활비 | 쿠팡 일반 결제 |
| 외식비 |  | 커피 | 외식비 | 카페 결제 |

업로드 시 사용자가 고른 유형은 `출금내역` 탭 raw data의 `내용` 컬럼에 저장됩니다.

## Apps Script API

`apps-script/Code.gs`는 아래 action을 제공합니다.

- `getTypes`: `gas 유형` A열의 유형 목록 조회
- `saveTypes`: `gas 유형` A열의 유형 목록 저장
- `getRules`: `gas 유형` C:E열의 자동분류 규칙 조회
- `saveRules`: `gas 유형` C:E열의 자동분류 규칙 저장
- `getExistingWithdrawalKeys`: `출금내역` raw data의 `업로드키` 조회
- `appendWithdrawals`: `출금내역` raw data 하단에 출금 행 추가
- `health`: 배포 계정이 제한된 Google Sheet를 열 수 있는지, `출금내역` raw 헤더가 있는지 점검

`appendWithdrawals` payload의 `type` 값은 Google Sheet의 `내용` 컬럼에 들어가는 유형입니다.

## Frontend 연동 방식

GitHub Pages에서 Apps Script Web App을 호출하므로 브라우저 CORS 제약을 피하기 위해 아래 방식을 사용합니다.

- 조회: JSONP GET
- 저장/업로드: hidden iframe form POST
- 저장/업로드 후: 다시 GET으로 조회해서 반영 확인

## 권한

권장 운영 방식:

- Google Sheet 일반 액세스: `제한됨`
- Apps Script Web App 실행 계정: `Me`
- Apps Script Web App 접근: 링크 호출 가능 설정

이 구조에서는 Google Sheet 원본 URL을 알아도 권한 없는 사람은 시트에 직접 접속할 수 없습니다. HTML 페이지는 Apps Script Web App을 호출하고, Apps Script는 배포자 계정 권한으로 제한된 Google Sheet를 읽고 씁니다.

## GitHub 확인

현재 PC에는 `gh` CLI가 설치되어 있지 않습니다. 저장소 생성과 Pages 설정은 GitHub 웹 또는 별도 설치한 GitHub CLI로 진행합니다.
