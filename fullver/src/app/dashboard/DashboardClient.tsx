"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare const XLSX: any;

interface ParsedRow {
  kind: "expense" | "income";
  month: string;
  traded_at: string;
  amount: number;
  type_name: string;
  note: string;
  upload_key: string;
  duplicated: boolean;
  include: boolean;
  displayDate: string;
  description: string;
  memo: string;
}

interface TxType {
  id: number;
  name: string;
  kind: string;
}

interface InvestForm {
  kind: string;
  category: string;
  product: string;
  traded_at: string;
  unit_price: string;
  quantity: string;
  amount: string;
  fee: string;
  return_rate: string;
  note: string;
}

const EMPTY_INVEST: InvestForm = {
  kind: "매수", category: "", product: "", traded_at: new Date().toISOString().slice(0, 10),
  unit_price: "", quantity: "", amount: "", fee: "", return_rate: "", note: "",
};

const HEADER_ROW_INDEX = 10;
const REQUIRED_HEADERS = ["거래일시", "구분", "거래금액", "거래 후 잔액", "거래구분", "내용", "메모"];

function parseAmount(v: unknown): number {
  const s = String(v ?? "").replace(/[−–—]/g, "-").replace(/[^\d.-]/g, "");
  return s ? Number(s) : NaN;
}

function parseTradeDate(v: unknown): { month: string; traded_at: string; displayDate: string } | null {
  let d: Date | null = null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    d = v;
  } else {
    const text = String(v ?? "").trim();
    const m = text.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})(?:[일\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!m) return null;
    d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear(), mo = d.getMonth() + 1, day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0"), mi = String(d.getMinutes()).padStart(2, "0"), ss = String(d.getSeconds()).padStart(2, "0");
  const mm = String(mo).padStart(2, "0"), dd = String(day).padStart(2, "0");
  return {
    month: `${y}-${mm}`,
    traded_at: `${y}.${mm}.${dd} ${hh}:${mi}:${ss}`,
    displayDate: `${y}-${mm}-${dd}`,
  };
}

function normalizeText(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function makeUploadKey(traded_at: string, amount: number, description: string, memo: string): string {
  return [traded_at, amount, description, memo].map(normalizeText).join("|");
}

function parseExcelRows(wb: any, existingKeys: Set<string>, types: TxType[], rules: Array<{ keyword: string; type_name: string }>): ParsedRow[] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headers = (raw[HEADER_ROW_INDEX] as string[]) || [];
  const normalizedH = headers.map((h) => String(h ?? "").replace(/\s+/g, " ").trim());

  const missingH = REQUIRED_HEADERS.filter((h) => !normalizedH.includes(h));
  if (missingH.length) throw new Error("헤더를 찾을 수 없습니다: " + missingH.join(", "));

  const idx = {
    tradedAt: normalizedH.indexOf("거래일시"),
    direction: normalizedH.indexOf("구분"),
    amount: normalizedH.indexOf("거래금액"),
    method: normalizedH.indexOf("거래구분"),
    description: normalizedH.indexOf("내용"),
    memo: normalizedH.indexOf("메모"),
  };

  return raw
    .slice(HEADER_ROW_INDEX + 1)
    .flatMap((row) => {
      const amount = parseAmount(row[idx.amount]);
      const dateParsed = parseTradeDate(row[idx.tradedAt]);
      if (!dateParsed || isNaN(amount) || amount >= 0) return [];
      const absAmount = Math.abs(amount);
      const description = normalizeText(row[idx.description]);
      const memo = normalizeText(row[idx.memo]);
      const upload_key = makeUploadKey(dateParsed.traded_at, absAmount, description, memo);
      const duplicated = existingKeys.has(upload_key);
      const searchText = `${description} ${memo} ${normalizeText(row[idx.method])}`;
      const matched = rules.find((r) => r.keyword && searchText.includes(r.keyword));
      const type_name = matched?.type_name || "";
      return [{
        kind: "expense" as const,
        month: dateParsed.month,
        traded_at: dateParsed.traded_at,
        amount: absAmount,
        type_name,
        note: [description, memo].filter(Boolean).join(" / "),
        upload_key,
        duplicated,
        include: !duplicated,
        displayDate: dateParsed.displayDate,
        description,
        memo,
      }];
    });
}

export default function DashboardClient() {
  const [tab, setTab] = useState<"upload" | "invest">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [types, setTypes] = useState<TxType[]>([]);
  const [rules, setRules] = useState<Array<{ keyword: string; type_name: string }>>([]);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [xlsxReady, setXlsxReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [investForm, setInvestForm] = useState<InvestForm>(EMPTY_INVEST);
  const [investStatus, setInvestStatus] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/types").then((r) => r.json()),
      fetch("/api/rules").then((r) => r.json()),
      fetch("/api/transactions/keys").then((r) => r.json()),
    ]).then(([t, rl, keys]) => {
      setTypes(t);
      setRules(rl);
      setExistingKeys(new Set(keys));
    });
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !xlsxReady) return;
    setFileName(file.name);
    setStatus("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target!.result, { type: "array", cellDates: true });
        const parsed = parseExcelRows(wb, existingKeys, types, rules);
        setRows(parsed);
        const newCount = parsed.filter((r) => !r.duplicated).length;
        const dupCount = parsed.filter((r) => r.duplicated).length;
        setStatus(`총 ${parsed.length}건 — 신규 ${newCount}건, 중복 ${dupCount}건`);
      } catch (err: any) {
        setStatus("파싱 오류: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function toggleRow(i: number) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, include: !r.include } : r)));
  }

  function setType(i: number, type_name: string) {
    setRows((prev) =>
      prev.map((r, j) =>
        j === i ? { ...r, type_name, upload_key: makeUploadKey(r.traded_at, r.amount, r.description, r.memo) } : r
      )
    );
  }

  async function handleUpload() {
    const toUpload = rows.filter((r) => r.include);
    if (!toUpload.length) { setStatus("업로드할 항목이 없습니다."); return; }
    setUploading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toUpload.map(({ kind, month, traded_at, amount, type_name, note, upload_key }) =>
          ({ kind, month, traded_at, amount, type_name, note, upload_key })
        )),
      });
      const data = await res.json();
      setStatus(`✓ ${data.inserted}건 업로드 완료`);
      const keysRes = await fetch("/api/transactions/keys").then((r) => r.json());
      setExistingKeys(new Set(keysRes));
      setRows((prev) => prev.map((r) => ({ ...r, duplicated: existingKeys.has(r.upload_key), include: false })));
    } catch {
      setStatus("업로드 오류");
    } finally {
      setUploading(false);
    }
  }

  async function handleInvestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInvestStatus("");
    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: investForm.kind,
          category: investForm.category,
          product: investForm.product,
          traded_at: investForm.traded_at,
          unit_price: Number(investForm.unit_price) || 0,
          quantity: Number(investForm.quantity) || 0,
          amount: Number(investForm.amount) || 0,
          fee: Number(investForm.fee) || 0,
          return_rate: Number(investForm.return_rate) || 0,
          note: investForm.note,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setInvestStatus("✓ 투자내역 저장 완료");
        setInvestForm(EMPTY_INVEST);
      } else {
        setInvestStatus("저장 오류");
      }
    } catch {
      setInvestStatus("서버 오류");
    }
  }

  const expenseTypes = types.filter((t) => t.kind === "expense");

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
        onLoad={() => setXlsxReady(true)}
      />

      <div className="page-header">
        <h1>대시보드</h1>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${tab === "upload" ? " active" : ""}`} onClick={() => setTab("upload")}>
          📤 출금 업로드
        </button>
        <button className={`tab-btn${tab === "invest" ? " active" : ""}`} onClick={() => setTab("invest")}>
          📈 투자 입력
        </button>
      </div>

      {tab === "upload" && (
        <div className="panel">
          <div className="toolbar">
            <label className="file-picker">
              <span>엑셀 선택</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} />
            </label>
            <span className="file-name">{fileName || "선택된 파일 없음"}</span>
            <button
              className="solid-button"
              disabled={rows.filter((r) => r.include).length === 0 || uploading}
              onClick={handleUpload}
            >
              {uploading ? "업로드 중…" : "업로드"}
            </button>
          </div>

          {status && <p className="summary">{status}</p>}

          {rows.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>선택</th>
                    <th>상태</th>
                    <th>날짜</th>
                    <th>금액</th>
                    <th>내용</th>
                    <th>유형</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.upload_key} className={row.duplicated ? "row-dup" : row.include ? "row-new" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.include}
                          disabled={row.duplicated}
                          onChange={() => toggleRow(i)}
                        />
                      </td>
                      <td>
                        <span className={`badge ${row.duplicated ? "badge-dup" : "badge-new"}`}>
                          {row.duplicated ? "중복" : "신규"}
                        </span>
                      </td>
                      <td>{row.displayDate}</td>
                      <td className="amount-cell">{row.amount.toLocaleString()}</td>
                      <td className="note-cell">{row.note}</td>
                      <td>
                        <select
                          value={row.type_name}
                          onChange={(e) => setType(i, e.target.value)}
                          className="type-select"
                        >
                          <option value="">-- 유형 선택 --</option>
                          {expenseTypes.map((t) => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length === 0 && (
            <p className="empty-hint">카카오뱅크 거래내역 엑셀 파일을 선택하세요.</p>
          )}
        </div>
      )}

      {tab === "invest" && (
        <div className="panel">
          <form className="invest-form" onSubmit={handleInvestSubmit}>
            <div className="form-row">
              <div className="field">
                <label>거래구분</label>
                <select value={investForm.kind} onChange={(e) => setInvestForm((f) => ({ ...f, kind: e.target.value }))}>
                  {["매수", "매도", "배당", "이자", "기타"].map((k) => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div className="field">
                <label>카테고리</label>
                <input value={investForm.category} onChange={(e) => setInvestForm((f) => ({ ...f, category: e.target.value }))} placeholder="국내주식, ETF, 펀드…" />
              </div>
              <div className="field">
                <label>상품명</label>
                <input value={investForm.product} onChange={(e) => setInvestForm((f) => ({ ...f, product: e.target.value }))} placeholder="삼성전자, KODEX200…" />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>거래일</label>
                <input type="date" value={investForm.traded_at} onChange={(e) => setInvestForm((f) => ({ ...f, traded_at: e.target.value }))} required />
              </div>
              <div className="field">
                <label>단가</label>
                <input type="number" value={investForm.unit_price} onChange={(e) => setInvestForm((f) => ({ ...f, unit_price: e.target.value }))} placeholder="0" />
              </div>
              <div className="field">
                <label>수량</label>
                <input type="number" value={investForm.quantity} onChange={(e) => setInvestForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>거래금액</label>
                <input type="number" value={investForm.amount} onChange={(e) => setInvestForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" required />
              </div>
              <div className="field">
                <label>수수료</label>
                <input type="number" value={investForm.fee} onChange={(e) => setInvestForm((f) => ({ ...f, fee: e.target.value }))} placeholder="0" />
              </div>
              <div className="field">
                <label>수익률 (%)</label>
                <input type="number" step="0.01" value={investForm.return_rate} onChange={(e) => setInvestForm((f) => ({ ...f, return_rate: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="field">
              <label>비고</label>
              <input value={investForm.note} onChange={(e) => setInvestForm((f) => ({ ...f, note: e.target.value }))} placeholder="메모" />
            </div>
            {investStatus && <p className="summary">{investStatus}</p>}
            <div className="toolbar end">
              <button type="submit" className="solid-button">저장</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
