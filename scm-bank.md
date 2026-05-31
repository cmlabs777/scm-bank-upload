# SCM 가계부 업로드 — 기술 참고서

> 다음 LLM이 이어서 작업할 때 읽는 문서.  
> 현재 구조, 설계 결정 이유, 확장 포인트를 기록한다.

---

## 1. 프로젝트 개요

카카오뱅크 거래내역 엑셀을 브라우저에서 파싱해 Google Sheet에 출금 raw data를 적재하는 정적 웹 도구.

| 항목 | 값 |
|---|---|
| 배포 URL | https://cmlabs777.github.io/scm-bank-upload/ |
| 저장소 | https://github.com/cmlabs777/scm-bank-upload (public) |
| Google Sheet | 스프레드시트 ID: `1XVJWlIeyo3zvugaJxMJcRxZPkqfxNadDROKwB3xDd-4` |
| GAS 배포 ID | `AKfycbw...` (DEPLOYMENT_CHECKLIST.md 참조, 커밋 제외됨) |
| GAS 버전 | @12 |

---

## 2. 아키텍처

```
브라우저 (GitHub Pages)
  ├── index.html          UI 구조
  ├── styles.css          베이지-웜 톤 디자인
  ├── app.js              상태 관리 + API 호출
  └── parser.js           엑셀 파싱 (SheetJS 사용)
        │ JSONP (GET)
        │ hidden iframe POST (쓰기)
        ▼
Google Apps Script Web App
  └── apps-script/Code.gs
        │ Spreadsheet API
        ▼
Google Sheet
  ├── gas 유형 탭    (유형 목록 A열, 자동분류 규칙 C:E열)
  └── 출금내역 탭   (raw data: 입출금구분/월구분/일자/금액/내용/비고/업로드키)
```

### 왜 JSONP + hidden iframe인가

GitHub Pages → GAS는 CORS 제약이 있다.  
- **GET 조회**: JSONP (`?callback=fn` 패턴, GAS가 `fn(JSON)` 반환)  
- **POST 쓰기**: hidden iframe form submit (응답 미검증, 의도적 설계)  
  → 쓰기 후 `getExistingWithdrawalKeys` GET 재조회로 성공 간접 확인

---

## 3. 파일 역할

### `app.js`

- **`state`**: 전역 상태. `types`, `rules`, `rows`, `existingKeys`, `preparedPayload`
- **`loadRemoteState()`**: GAS에서 health → types/rules → existingKeys 순차 로딩. 페이지 열릴 때 endpoint 저장되어 있으면 자동 실행됨.
- **`parseExcel(file)`**: SheetJS로 엑셀 파싱 → `ScmParser.parseBankRows()` → `renderTransactions()`
- **`apiGet(action)`**: JSONP Promise 래퍼. 20초 타임아웃.
- **`apiPostForm(payload)`**: hidden iframe form POST. 항상 `{ ok: true }` resolve (응답 미검증).
- **`setSyncing(bool)`**: 동기화 중 버튼 비활성화. `#excelInput`은 의도적으로 제외 (파일 선택은 항상 가능).

### `parser.js`

- **`parseBankRows(rows, options)`**: 11행 헤더(index 10), 12행부터 데이터, `거래금액 < 0` 필터
- **`makeUploadKey(row)`**: `tradedAt|absoluteAmount|description|memo` 형태로 중복 방지 키 생성. `|` 포함 보장됨.
- **`guessType(row, types, rules)`**: 키워드 규칙 매칭. **매칭 실패 시 빈 문자열 반환** (types[0] fallback 없음 — 의도적). 미선택 상태로 두어 사용자가 수동 선택하게 유도.
- **`sheetDate` 포맷**: `"2026. 5. 2"` (월/일 zero-padding 없음). GAS `parseSheetDate_`가 파싱 가능.

### `apps-script/Code.gs`

GAS Web App. `doGet` → JSONP, `doPost` → JSON.

| action | 방향 | 설명 |
|---|---|---|
| `health` | GET | Sheet 존재 여부 확인 |
| `getTypes` | GET | gas 유형 탭 A열 반환 |
| `saveTypes` | POST | A열 덮어쓰기 |
| `getRules` | GET | C:E열 반환 |
| `saveRules` | POST | C:E열 덮어쓰기 |
| `getExistingWithdrawalKeys` | GET | 업로드키 컬럼 전체 반환 |
| `appendWithdrawals` | POST | 출금내역 탭 하단에 행 추가 |
| `repairWithdrawalDates` | GET | 전체 행 월구분 수식 재적용 |
| `inspectMonth` | GET | 마지막 10행 월구분 셀 진단 |

#### 핵심 GAS 동작 주의사항

**`월구분` 컬럼은 반드시 `setNumberFormat("@")` → `setFormulas()` 순서로 적용해야 한다.**

- `setFormulas()` 후 `setNumberFormat("@")` → GAS가 수식 결과("2026-05")를 날짜로 재변환함 (버그)
- `setNumberFormat("@")` 후 `setFormulas()` → 수식이 TEXT로 평가됨 (정상)
- 이 순서는 `applyWithdrawalDateFormulas_()` 함수에서 구현되어 있음

수식: `=YEAR(D행)&"-"&TEXT(MONTH(D행),"00")` → "2026-05" 텍스트

---

## 4. Google Sheet 구조

### `gas 유형` 탭

| 열 | 내용 |
|---|---|
| A1 | `유형` (헤더) |
| A2~ | 유형명 목록 |
| B열 | 비워둠 |
| C1 | `키워드` |
| D1 | `추천유형` |
| E1 | `설명` |
| C2~E | 자동분류 규칙 |

### `출금내역` 탭 raw data 컬럼

| 컬럼 | 내용 | 비고 |
|---|---|---|
| 입출금구분 | `출금` 고정 | |
| 월구분 | `=YEAR(D)&"-"&TEXT(MONTH(D),"00")` 수식 | `@` 서식, TEXT 타입 |
| 일자 | Date 값 | `yyyy. m. d` 서식 |
| 금액 | 양수 금액 | |
| 내용 | 사용자 선택 유형 | |
| 비고 | 엑셀 내용/메모 | |
| 업로드키 | `tradedAt\|amount\|desc\|memo` | 중복 방지, `\|` 포함 보장 |

---

## 5. 중복 방지 메커니즘

1. 앱 로딩 시 `getExistingWithdrawalKeys` → 기존 키 Set 구성
2. 엑셀 파싱 시 `makeUploadKey`로 각 행의 키 생성
3. 기존 키 Set에 있으면 `duplicated: true`, `include: false`
4. GAS `appendWithdrawals_`에서 서버 측 재검증 (이중 방어)
5. GAS에서 `업로드키` 컬럼 자동 생성 (`findWithdrawalTable_` + `ensureUploadKeyColumn_`)

---

## 6. 배포 방법 (GAS 변경 시)

```bash
cd scm
# 코드 수정 후
clasp push
clasp deploy --deploymentId "AKfycbw..." --description "@버전 설명"
```

- `.clasp.json`은 `.gitignore`에 포함 (커밋 제외)
- `scriptId`: `1WynlP4TS-DVb0cpw9XNyoJa8rLO2d0mm2c-zHEtukxTey2xtDDulExyw`
- 실제 GAS URL은 `DEPLOYMENT_CHECKLIST.md` 참조 (커밋 제외)

---

## 7. 알려진 설계 한계

| 항목 | 현황 | 개선 방향 |
|---|---|---|
| POST 응답 미검증 | hidden iframe이라 GAS 에러 탐지 불가 | 업로드 후 키 재조회로 간접 확인 |
| 단일 계좌 (카카오뱅크) | `parser.js` HEADER_ROW_INDEX=10 하드코딩 | 은행별 파서 분기 추가 |
| 모바일 테이블 가독성 | 최소 폭 980px | 반응형 카드 뷰 고려 |
| GAS 첫 응답 느림 | cold start 수초 소요 | 로딩 인디케이터로 UX 보완 가능 |

---

## 8. 확장 포인트

### 다른 은행 엑셀 지원
`parser.js`에 은행별 파서 추가:
```js
// HEADER_ROW_INDEX, REQUIRED_HEADERS, normalizeBankRow 를 은행별로 분기
function parseBankRows(rows, options = {}) {
  const bankType = detectBankType(rows); // 헤더 패턴으로 은행 감지
  // ...
}
```

### 월별 지출 요약 뷰
`getMonthSummary` GAS action 추가 → 월별 유형별 집계 반환 → 차트 렌더링

### 예산 관리
`gas 유형` 탭에 F열 `예산` 추가 → GAS `getBudgets()` → 프론트 비교 표시

### GAS 함수 직접 실행
진단용: 브라우저 새 탭에서 `[GAS URL]?action=inspectMonth` 등 직접 열기 가능 (JSON 반환)
