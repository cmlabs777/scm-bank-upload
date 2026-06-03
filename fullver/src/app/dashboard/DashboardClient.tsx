"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";

interface SheetJsWorkbook {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

interface SheetJsApi {
  read(data: string | ArrayBuffer | null, options: { type: string; cellDates: boolean }): SheetJsWorkbook;
  utils: {
    sheet_to_json(sheet: unknown, options: { header: 1; defval: string }): unknown[][];
  };
}

declare const XLSX: SheetJsApi;

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

interface TxType { id: number; name: string; kind: string; }
interface Rule { id?: number; keyword: string; kind: "expense" | "income"; type_name: string; description?: string; }

interface ManualTxForm {
  kind: "expense" | "income";
  traded_at: string;
  amount: string;
  type_name: string;
  note: string;
}

interface InvestForm {
  kind: string; category: string; product: string; traded_at: string;
  unit_price: string; quantity: string; amount: string; fee: string; return_rate: string; note: string;
}

const EMPTY_TX: ManualTxForm = { kind: "expense", traded_at: new Date().toISOString().slice(0,10), amount: "", type_name: "", note: "" };
const EMPTY_INVEST: InvestForm = { kind: "매수", category: "", product: "", traded_at: new Date().toISOString().slice(0,10), unit_price: "", quantity: "", amount: "", fee: "", return_rate: "", note: "" };
const HEADER_ROW_INDEX = 10;
const REQUIRED_HEADERS = ["거래일시","구분","거래금액","거래 후 잔액","거래구분","내용","메모"];

function parseAmount(v: unknown): number {
  const s = String(v ?? "").replace(/[−–—]/g,"-").replace(/[^\d.-]/g,"");
  return s ? Number(s) : NaN;
}

function parseTradeDate(v: unknown) {
  let d: Date | null = null;
  if (v instanceof Date && !isNaN(v.getTime())) { d = v; }
  else {
    const text = String(v ?? "").trim();
    const m = text.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})(?:[일\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!m) return null;
    d = new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
  }
  if (!d || isNaN(d.getTime())) return null;
  const y=d.getFullYear(), mo=d.getMonth()+1, day=d.getDate();
  const mm=String(mo).padStart(2,"0"), dd=String(day).padStart(2,"0");
  const hh=String(d.getHours()).padStart(2,"0"), mi=String(d.getMinutes()).padStart(2,"0"), ss=String(d.getSeconds()).padStart(2,"0");
  return { month:`${y}-${mm}`, traded_at:`${y}.${mm}.${dd} ${hh}:${mi}:${ss}`, displayDate:`${y}-${mm}-${dd}` };
}

function normalizeText(v: unknown) { return String(v??"").replace(/\s+/g," ").trim(); }
function makeUploadKey(traded_at:string, amount:number, desc:string, memo:string) {
  return [traded_at,amount,desc,memo].map(normalizeText).join("|");
}

function parseExcelRows(wb: SheetJsWorkbook, existingKeys: Set<string>, types: TxType[], rules: Rule[]): ParsedRow[] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header:1, defval:"" });
  const headers = (raw[HEADER_ROW_INDEX] as string[]) || [];
  const normH = headers.map(h => normalizeText(h));
  const missing = REQUIRED_HEADERS.filter(h => !normH.includes(h));
  if (missing.length) throw new Error("헤더를 찾을 수 없습니다: " + missing.join(", "));
  const idx = {
    tradedAt: normH.indexOf("거래일시"),
    direction: normH.indexOf("구분"),
    amount: normH.indexOf("거래금액"),
    method: normH.indexOf("거래구분"),
    description: normH.indexOf("내용"),
    memo: normH.indexOf("메모"),
  };

  return raw.slice(HEADER_ROW_INDEX + 1).flatMap((row) => {
    const amount = parseAmount(row[idx.amount]);
    const dateParsed = parseTradeDate(row[idx.tradedAt]);
    if (!dateParsed || isNaN(amount) || amount === 0) return [];

    const kind: "expense"|"income" = amount < 0 ? "expense" : "income";
    const absAmount = Math.abs(amount);
    const description = normalizeText(row[idx.description]);
    const memo = normalizeText(row[idx.memo]);
    const upload_key = makeUploadKey(dateParsed.traded_at, absAmount, description, memo);
    const duplicated = existingKeys.has(upload_key);
    const searchText = `${description} ${memo} ${normalizeText(row[idx.method])}`;
    const matched = rules.find(r => r.kind === kind && r.keyword && searchText.includes(r.keyword));
    return [{
      kind, month: dateParsed.month, traded_at: dateParsed.traded_at,
      amount: absAmount, type_name: matched?.type_name || "",
      note: [description, memo].filter(Boolean).join(" / "),
      upload_key, duplicated, include: !duplicated,
      displayDate: dateParsed.displayDate, description, memo,
    }];
  });
}

export default function DashboardClient() {
  const [tab, setTab] = useState<"upload"|"manual"|"invest">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [types, setTypes] = useState<TxType[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [xlsxReady, setXlsxReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [kindFilter, setKindFilter] = useState<"all"|"expense"|"income">("all");

  const [manualForm, setManualForm] = useState<ManualTxForm>(EMPTY_TX);
  const [manualStatus, setManualStatus] = useState("");

  const [investForm, setInvestForm] = useState<InvestForm>(EMPTY_INVEST);
  const [investStatus, setInvestStatus] = useState("");
  const [investSubmitting, setInvestSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/types").then(r=>r.json()),
      fetch("/api/rules").then(r=>r.json()),
      fetch("/api/transactions/keys").then(r=>r.json()),
    ]).then(([t,rl,keys]) => { setTypes(t); setRules(rl); setExistingKeys(new Set(keys)); });
  }, []);

  const refreshKeys = async () => {
    const keys = await fetch("/api/transactions/keys").then(r=>r.json());
    setExistingKeys(new Set(keys));
  };

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !xlsxReady) return;
    setFileName(file.name); setStatus("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target!.result, { type:"array", cellDates:true });
        const parsed = parseExcelRows(wb, existingKeys, types, rules);
        setRows(parsed);
        const income = parsed.filter(r=>r.kind==="income"), expense = parsed.filter(r=>r.kind==="expense");
        const newCnt = parsed.filter(r=>!r.duplicated).length, dupCnt = parsed.filter(r=>r.duplicated).length;
        setStatus(`총 ${parsed.length}건 (입금 ${income.length} / 출금 ${expense.length}) — 신규 ${newCnt}건, 중복 ${dupCnt}건`);
      } catch(err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus("파싱 오류: " + message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function toggleRow(i: number) { setRows(p=>p.map((r,j)=>j===i?{...r,include:!r.include}:r)); }
  function setType(i: number, type_name: string) { setRows(p=>p.map((r,j)=>j===i?{...r,type_name}:r)); }

  const filteredRows = kindFilter==="all" ? rows : rows.filter(r=>r.kind===kindFilter);

  async function handleUpload() {
    const toUpload = rows.filter(r=>r.include);
    if (!toUpload.length) { setStatus("업로드할 항목이 없습니다."); return; }
    const missingTypeCount = toUpload.filter(r=>!r.type_name).length;
    if (missingTypeCount > 0) {
      setStatus(`유형이 선택되지 않은 항목이 ${missingTypeCount}건 있습니다.`);
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/transactions", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(toUpload.map(({kind,month,traded_at,amount,type_name,note,upload_key})=>({kind,month,traded_at,amount,type_name,note,upload_key}))),
      });
      const data = await res.json();
      setStatus(`✓ ${data.inserted}건 업로드 완료`);
      await refreshKeys();
      setRows(p=>p.map(r=>({...r,duplicated:true,include:false})));
    } catch { setStatus("업로드 오류"); } finally { setUploading(false); }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault(); setManualStatus("");
    const date = manualForm.traded_at;
    const [y,mo,d] = date.split("-");
    const month = `${y}-${mo}`;
    const traded_at = `${y}.${mo}.${d} 00:00:00`;
    const amount = Number(manualForm.amount);
    if (!amount) { setManualStatus("금액을 입력하세요."); return; }
    if (!manualForm.type_name) { setManualStatus("유형을 선택하세요."); return; }
    const upload_key = makeUploadKey(traded_at, amount, manualForm.type_name, manualForm.note);
    try {
      const res = await fetch("/api/transactions", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify([{ kind:manualForm.kind, month, traded_at, amount, type_name:manualForm.type_name, note:manualForm.note, upload_key }]),
      });
      if (!res.ok) { setManualStatus("서버 오류"); return; }
      const data = await res.json();
      if (data.inserted > 0) {
        setManualStatus("✓ 저장 완료"); setManualForm(EMPTY_TX); await refreshKeys();
      } else { setManualStatus("중복 항목입니다."); }
    } catch { setManualStatus("서버 오류"); }
  }

  async function handleInvestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (investSubmitting) return;
    setInvestStatus(""); setInvestSubmitting(true);
    try {
      const res = await fetch("/api/investments", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ kind:investForm.kind, category:investForm.category, product:investForm.product, traded_at:investForm.traded_at,
          unit_price:Number(investForm.unit_price)||0, quantity:Number(investForm.quantity)||0,
          amount:Number(investForm.amount)||0, fee:Number(investForm.fee)||0, return_rate:Number(investForm.return_rate)||0, note:investForm.note }),
      });
      if (!res.ok) { setInvestStatus("서버 오류"); return; }
      const data = await res.json();
      if (data.ok) { setInvestStatus("✓ 저장 완료"); setInvestForm(EMPTY_INVEST); }
      else setInvestStatus("오류");
    } catch { setInvestStatus("서버 오류"); } finally { setInvestSubmitting(false); }
  }

  const expTypes = types.filter(t=>t.kind==="expense");
  const incTypes = types.filter(t=>t.kind==="income");

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" onLoad={()=>setXlsxReady(true)} />

      <div className="page-header">
        <h1>거래 입력</h1>
        <Link href="/transactions" className="ghost-button" style={{fontSize:13}}>가계부 보기 →</Link>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${tab==="upload"?" active":""}`} onClick={()=>setTab("upload")}>📤 엑셀 업로드</button>
        <button className={`tab-btn${tab==="manual"?" active":""}`} onClick={()=>setTab("manual")}>✏️ 수기 입력</button>
        <button className={`tab-btn${tab==="invest"?" active":""}`} onClick={()=>setTab("invest")}>📈 투자 입력</button>
      </div>

      {/* ── 엑셀 업로드 ── */}
      {tab==="upload" && (
        <div className="panel">
          <div className="toolbar">
            <label className="file-picker">
              <span>엑셀 선택</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} />
            </label>
            <span className="file-name">{fileName||"선택된 파일 없음"}</span>
            <div className="kind-filter">
              {(["all","expense","income"] as const).map(k=>(
                <button key={k} className={`filter-btn${kindFilter===k?" active":""}`} onClick={()=>setKindFilter(k)}>
                  {k==="all"?"전체":k==="expense"?"출금":"입금"}
                </button>
              ))}
            </div>
            <button className="solid-button" disabled={rows.filter(r=>r.include).length===0||rows.some(r=>r.include&&!r.type_name)||uploading} onClick={handleUpload}>
              {uploading?"업로드 중…":"업로드"}
            </button>
          </div>

          {status && (
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:4}}>
              <p className="summary" style={{margin:0}}>{status}</p>
              {status.startsWith("✓") && (
                <Link href="/transactions" className="solid-button" style={{padding:"6px 16px",fontSize:13,textDecoration:"none"}}>
                  가계부에서 확인 →
                </Link>
              )}
            </div>
          )}

          {filteredRows.length>0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>선택</th><th>구분</th><th>상태</th><th>날짜</th><th>금액</th><th>내용</th><th>유형</th></tr></thead>
                <tbody>
                  {filteredRows.map((row)=>{
                    const realIdx = rows.indexOf(row);
                    const typeList = row.kind==="expense" ? expTypes : incTypes;
                    return (
                      <tr key={row.upload_key} className={row.duplicated?"row-dup":row.include?"row-new":""}>
                        <td><input type="checkbox" checked={row.include} disabled={row.duplicated} onChange={()=>toggleRow(realIdx)}/></td>
                        <td><span className={`badge ${row.kind==="income"?"badge-income":"badge-expense"}`}>{row.kind==="income"?"입금":"출금"}</span></td>
                        <td><span className={`badge ${row.duplicated?"badge-dup":"badge-new"}`}>{row.duplicated?"중복":"신규"}</span></td>
                        <td>{row.displayDate}</td>
                        <td className="amount-cell">{row.amount.toLocaleString()}</td>
                        <td className="note-cell">{row.note}</td>
                        <td>
                          <select value={row.type_name} onChange={e=>setType(realIdx,e.target.value)} className="type-select">
                            <option value="">-- 유형 --</option>
                            {typeList.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rows.length===0 && <p className="empty-hint">카카오뱅크 거래내역 엑셀을 선택하세요.</p>}
        </div>
      )}

      {/* ── 수기 입력 ── */}
      {tab==="manual" && (
        <div className="panel">
          <h2>거래 수기 입력</h2>
          <form className="invest-form" onSubmit={handleManualSubmit}>
            <div className="form-row">
              <div className="field">
                <label>구분</label>
                <select value={manualForm.kind} onChange={e=>setManualForm(f=>({...f,kind:e.target.value as "expense"|"income",type_name:""}))}>
                  <option value="expense">출금</option>
                  <option value="income">입금</option>
                </select>
              </div>
              <div className="field">
                <label>날짜</label>
                <input type="date" value={manualForm.traded_at} onChange={e=>setManualForm(f=>({...f,traded_at:e.target.value}))} required />
              </div>
              <div className="field">
                <label>금액</label>
                <input type="number" value={manualForm.amount} onChange={e=>setManualForm(f=>({...f,amount:e.target.value}))} placeholder="0" required />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>유형</label>
                <select value={manualForm.type_name} onChange={e=>setManualForm(f=>({...f,type_name:e.target.value}))}>
                  <option value="">-- 유형 선택 --</option>
                  {(manualForm.kind==="expense"?expTypes:incTypes).map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div className="field" style={{flex:2}}>
                <label>메모</label>
                <input value={manualForm.note} onChange={e=>setManualForm(f=>({...f,note:e.target.value}))} placeholder="메모" />
              </div>
            </div>
            {manualStatus && (
              <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <p className="summary" style={{margin:0}}>{manualStatus}</p>
                {manualStatus.startsWith("✓") && (
                  <Link href="/transactions" className="ghost-button" style={{fontSize:13,textDecoration:"none"}}>가계부에서 확인 →</Link>
                )}
              </div>
            )}
            <div className="toolbar end"><button type="submit" className="solid-button">저장</button></div>
          </form>
        </div>
      )}

      {/* ── 투자 입력 ── */}
      {tab==="invest" && (
        <div className="panel">
          <h2>투자내역 수기 입력</h2>
          <form className="invest-form" onSubmit={handleInvestSubmit}>
            <div className="form-row">
              <div className="field">
                <label>거래구분</label>
                <select value={investForm.kind} onChange={e=>setInvestForm(f=>({...f,kind:e.target.value}))}>
                  {["매수","매도","배당","이자","기타"].map(k=><option key={k}>{k}</option>)}
                </select>
              </div>
              <div className="field"><label>카테고리</label><input value={investForm.category} onChange={e=>setInvestForm(f=>({...f,category:e.target.value}))} placeholder="국내주식, ETF…"/></div>
              <div className="field"><label>상품명</label><input value={investForm.product} onChange={e=>setInvestForm(f=>({...f,product:e.target.value}))} placeholder="삼성전자…"/></div>
            </div>
            <div className="form-row">
              <div className="field"><label>거래일</label><input type="date" value={investForm.traded_at} onChange={e=>setInvestForm(f=>({...f,traded_at:e.target.value}))} required/></div>
              <div className="field"><label>단가</label><input type="number" value={investForm.unit_price} onChange={e=>setInvestForm(f=>({...f,unit_price:e.target.value}))} placeholder="0"/></div>
              <div className="field"><label>수량</label><input type="number" value={investForm.quantity} onChange={e=>setInvestForm(f=>({...f,quantity:e.target.value}))} placeholder="0"/></div>
            </div>
            <div className="form-row">
              <div className="field"><label>거래금액</label><input type="number" value={investForm.amount} onChange={e=>setInvestForm(f=>({...f,amount:e.target.value}))} placeholder="0" required/></div>
              <div className="field"><label>수수료</label><input type="number" value={investForm.fee} onChange={e=>setInvestForm(f=>({...f,fee:e.target.value}))} placeholder="0"/></div>
              <div className="field"><label>수익률(%)</label><input type="number" step="0.01" value={investForm.return_rate} onChange={e=>setInvestForm(f=>({...f,return_rate:e.target.value}))} placeholder="0"/></div>
            </div>
            <div className="field"><label>비고</label><input value={investForm.note} onChange={e=>setInvestForm(f=>({...f,note:e.target.value}))} placeholder="메모"/></div>
            {investStatus && <p className="summary">{investStatus}</p>}
            <div className="toolbar end"><button type="submit" className="solid-button" disabled={investSubmitting}>{investSubmitting?"저장 중…":"저장"}</button></div>
          </form>
        </div>
      )}
    </>
  );
}
