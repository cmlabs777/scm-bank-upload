# fullver 작업 상태

## 완료

- 기존 배포본과 분리된 `scm/fullver` 폴더 생성
- 정적 페이지 풀버전 구성
  - 출금 업로드
  - 입금 업로드
  - 출금/입금 유형 관리
  - 투자 입력
- 카카오뱅크 엑셀 파서 확장
  - 출금: `거래금액 < 0`
  - 입금: `거래금액 > 0`
- 기존 출금 중복 제외와 호환되는 업로드키 유지
- Apps Script 풀버전 추가
  - `출금내역` append
  - `입금내역` append
  - `gas 유형` 관리
  - `gas 입금유형` 관리
  - `투자raw` 생성 및 append
- 문법 검증
  - `fullver/app.js`
  - `fullver/parser.js`
  - `fullver/apps-script/Code.gs`
- 실제 카카오뱅크 엑셀 샘플 파싱 확인
  - 출금 90건
  - 입금 8건

## 배포 전 확인

- `fullver/apps-script/Code.gs`를 새 Apps Script 프로젝트에 배포하거나, 기존 프로젝트에 덮어쓸지 결정
- 웹앱 배포 후 `fullver/index.html`에서 새 Apps Script URL 저장
- 최초 실행 시 `gas 입금유형`, `투자raw` 탭이 생성되는지 확인
- 입금 업로드 테스트는 소량 선택 후 진행
- 투자 입력은 `투자raw` 탭에 저장되는지 먼저 1건으로 확인

## 운영 원칙

- 기존 배포본은 계속 `scm` 루트 파일을 사용
- 풀버전은 `scm/fullver` 파일만 사용
- 투자내역은 은행 엑셀에서 자동 생성하지 않고 별도 입력/향후 증권사 업로드로 확장
