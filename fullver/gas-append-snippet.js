/**
 * SCM 앱 → Google Sheets 자동 적재
 *
 * 사용법:
 *   기존 GAS 스크립트의 doGet(e) 함수 안에 아래 조건문을 추가하세요.
 *   appendTransaction 함수는 스크립트 어디에든 붙여넣으면 됩니다.
 *
 * doGet(e) 안에 추가할 분기:
 * ─────────────────────────────────────────────────────
 *   if (action === 'appendTransaction') {
 *     const result = appendTransaction(e.parameter);
 *     return ContentService
 *       .createTextOutput(JSON.stringify(result))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   }
 * ─────────────────────────────────────────────────────
 *
 * 주의:
 *   - 시트 이름이 다르면 SHEET_NAMES 수정
 *   - 헤더 행 번호가 다르면 HEADER_ROW 수정
 *   - 배포(배포 관리 → 새 버전 배포)를 다시 해야 반영됩니다
 */

const SHEET_NAMES = {
  income:  '입금내역',
  expense: '지출내역',
};
const HEADER_ROW = 1; // 컬럼 이름이 있는 행 번호

/**
 * 헤더 이름으로 컬럼을 자동 매핑하여 행을 추가합니다.
 * 헤더 이름 목록 (대소문자·공백 무시):
 *   날짜 | 일자 | traded_at  → traded_at (YYYY-MM-DD)
 *   금액 | amount            → 숫자
 *   유형 | 구분 | type_name  → 문자열
 *   메모 | 비고 | note       → 문자열
 *   월   | month             → YYYY-MM
 *   upload_key               → 중복방지 키
 */
function appendTransaction(params) {
  const sheetName = SHEET_NAMES[params.kind];
  if (!sheetName) return { ok: false, error: 'unknown kind: ' + params.kind };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: '시트 없음: ' + sheetName };

  // 헤더 읽기
  const lastCol = sheet.getLastColumn() || 1;
  const headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];

  // 헤더 이름 → 값 매핑 (한/영 모두 지원)
  const normalize = s => String(s).trim().toLowerCase().replace(/\s/g, '');
  const fieldMap = {
    '날짜':      params.traded_at,
    '일자':      params.traded_at,
    'traded_at': params.traded_at,
    '금액':      Number(params.amount),
    'amount':    Number(params.amount),
    '유형':      params.type_name,
    '구분':      params.type_name,
    'type_name': params.type_name,
    '메모':      params.note || '',
    '비고':      params.note || '',
    'note':      params.note || '',
    '월':        params.month,
    'month':     params.month,
    'upload_key': params.upload_key,
  };

  const row = headers.map(h => {
    const key = normalize(h);
    return fieldMap[key] !== undefined ? fieldMap[key] : '';
  });

  sheet.appendRow(row);
  return { ok: true };
}
