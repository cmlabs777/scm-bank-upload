"use client";

import { useState, useEffect, useRef } from "react";

const N = 15;
const EMPTY = 0, BLACK = 1, WHITE = 2;
const MARGIN = 22;
const STARS: [number, number][] = [
  [3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11],
];
const DIRS: [number, number][] = [[0,1],[1,0],[1,1],[1,-1]];

type Stone  = 0|1|2;
type Board  = Stone[][];
type Diff   = "easy"|"medium"|"hard";
type Status = "playing"|"won"|"lost"|"draw";

function newBoard(): Board {
  return Array.from({length:N}, () => Array<Stone>(N).fill(EMPTY));
}

function inB(r: number, c: number): boolean {
  return r >= 0 && r < N && c >= 0 && c < N;
}

function span(b: Board, r: number, c: number, dr: number, dc: number, s: Stone): number {
  let n = 0;
  for (let i = 1; i <= 5; i++) {
    const nr = r+dr*i, nc = c+dc*i;
    if (inB(nr,nc) && b[nr][nc] === s) n++;
    else break;
  }
  return n;
}

function checkWin(b: Board, r: number, c: number, s: Stone): boolean {
  if (!inB(r,c) || !s) return false;
  for (const [dr,dc] of DIRS) {
    if (1 + span(b,r,c,dr,dc,s) + span(b,r,c,-dr,-dc,s) >= 5) return true;
  }
  return false;
}

// ── AI ─────────────────────────────────────────────────────────────────────────

function getCands(b: Board): [number,number][] {
  const seen = new Set<number>();
  const res: [number,number][] = [];
  let hasAny = false;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (b[r][c] === EMPTY) continue;
      hasAny = true;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r+dr, nc = c+dc, k = nr*N+nc;
          if (inB(nr,nc) && b[nr][nc] === EMPTY && !seen.has(k)) {
            seen.add(k); res.push([nr,nc]);
          }
        }
      }
    }
  }
  return hasAny ? res : [[7,7]];
}

// 열린 4 = 사실상 필패, 열린 3 = 강한 위협
function seqScore(cnt: number, open: number, forWhite: boolean): number {
  const s = forWhite ? 1 : -1;
  if (cnt >= 5) return s * 900000;
  if (open === 0) return 0;
  if (cnt === 4) return s * (open === 2 ? 500000 : 25000);
  if (cnt === 3) return s * (open === 2 ? 15000  : 1200);
  if (cnt === 2) return s * (open === 2 ? 500    : 60);
  return 0;
}

function evalBoard(b: Board): number {
  let score = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const s = b[r][c];
      if (!s) continue;
      for (const [dr,dc] of DIRS) {
        if (inB(r-dr, c-dc) && b[r-dr][c-dc] === s) continue;
        let cnt = 0, nr = r, nc = c;
        while (inB(nr,nc) && b[nr][nc] === s) { cnt++; nr += dr; nc += dc; }
        let open = 0;
        if (inB(r-dr, c-dc) && b[r-dr][c-dc] === EMPTY) open++;
        if (inB(nr,  nc   ) && b[nr  ][nc   ] === EMPTY) open++;
        score += seqScore(cnt, open, s === WHITE);
      }
    }
  }
  return score;
}

// 한 교점을 놓았을 때 해당 라인 강도 (항상 양수, 정렬 전용)
function lineScore(b: Board, r: number, c: number, s: Stone): number {
  b[r][c] = s;
  let sc = 0;
  for (const [dr,dc] of DIRS) {
    let cnt = 1, open = 0;
    let nr = r+dr, nc = c+dc;
    while (inB(nr,nc) && b[nr][nc] === s) { cnt++; nr+=dr; nc+=dc; }
    if (inB(nr,nc) && b[nr][nc] === EMPTY) open++;
    nr = r-dr; nc = c-dc;
    while (inB(nr,nc) && b[nr][nc] === s) { cnt++; nr-=dr; nc-=dc; }
    if (inB(nr,nc) && b[nr][nc] === EMPTY) open++;
    if (cnt >= 5) sc += 900000;
    else if (open > 0) {
      if      (cnt === 4) sc += open === 2 ? 500000 : 25000;
      else if (cnt === 3) sc += open === 2 ? 15000  : 1200;
      else if (cnt === 2) sc += open === 2 ? 500    : 60;
    }
  }
  b[r][c] = EMPTY;
  return sc;
}

// 수의 중요도: 공격 가치 + 방어 가치 (항상 양수 → 높을수록 먼저 탐색)
function importance(b: Board, r: number, c: number): number {
  return lineScore(b,r,c,WHITE) + lineScore(b,r,c,BLACK) * 0.9;
}

// 특정 돌 종류가 놓을 수 있는 즉시 승리 위치 개수
function winCount(b: Board, s: Stone): number {
  let cnt = 0;
  for (const [r,c] of getCands(b)) {
    b[r][c] = s;
    if (checkWin(b,r,c,s)) cnt++;
    b[r][c] = EMPTY;
  }
  return cnt;
}

function quickWin(b: Board, s: Stone): [number,number]|null {
  for (const [r,c] of getCands(b)) {
    b[r][c] = s;
    const w = checkWin(b,r,c,s);
    b[r][c] = EMPTY;
    if (w) return [r,c];
  }
  return null;
}

function sortCands(
  b: Board, cands: [number,number][], limit: number
): { r: number; c: number }[] {
  return cands
    .map(([r,c]) => ({ r, c, t: importance(b,r,c) }))
    .sort((a,z) => z.t - a.t)  // 중요도 내림차순 — 공격/방어 모두 상위 탐색
    .slice(0, limit);
}

function minimax(
  b: Board, depth: number, alpha: number, beta: number,
  maxing: boolean, lr: number, lc: number, ls: Stone
): number {
  if (ls && checkWin(b,lr,lc,ls)) return ls === WHITE ? 900000+depth : -900000-depth;
  if (depth === 0) return evalBoard(b);
  const s: Stone = maxing ? WHITE : BLACK;
  const raw = getCands(b);
  if (!raw.length) return evalBoard(b);
  const cands = sortCands(b, raw, 20);
  if (maxing) {
    let v = -Infinity;
    for (const {r,c} of cands) {
      b[r][c] = s;
      v = Math.max(v, minimax(b, depth-1, alpha, beta, false, r, c, s));
      b[r][c] = EMPTY;
      alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return v;
  } else {
    let v = Infinity;
    for (const {r,c} of cands) {
      b[r][c] = s;
      v = Math.min(v, minimax(b, depth-1, alpha, beta, true, r, c, s));
      b[r][c] = EMPTY;
      beta = Math.min(beta, v);
      if (beta <= alpha) break;
    }
    return v;
  }
}

function findMove(b: Board, diff: Diff): [number,number] {
  const cands = getCands(b);
  if (!cands.length) return [7,7];

  // 첫 수: 중앙 근처
  if (b.every(row => row.every(c => !c))) {
    const off = diff === "easy" ? 2 : 1;
    return [
      7 - off + Math.floor(Math.random()*(off*2+1)),
      7 - off + Math.floor(Math.random()*(off*2+1)),
    ];
  }

  // AI 즉시 승리
  const win = quickWin(b, WHITE);
  if (win) return win;

  // 상대 즉시 승리 위치가 2개 이상 = 열린 4 → 둘 다 막을 수 없으나 일단 하나 막음
  const playerWins = winCount(b, BLACK);
  if (playerWins >= 1) {
    const block = quickWin(b, BLACK);
    if (block) return block;
  }

  // 쉬움: 40% 랜덤
  if (diff === "easy" && Math.random() < 0.4)
    return cands[Math.floor(Math.random() * Math.min(cands.length, 10))];

  const depth = diff === "easy" ? 1 : diff === "medium" ? 3 : 5;

  const sorted = sortCands(b, cands, 22);
  let best = -Infinity;
  let bestMove: [number,number] = [sorted[0].r, sorted[0].c];

  for (const {r,c} of sorted) {
    b[r][c] = WHITE;
    const v = minimax(b, depth-1, -Infinity, Infinity, false, r, c, WHITE);
    b[r][c] = EMPTY;
    if (v > best) { best = v; bestMove = [r,c]; }
  }
  return bestMove;
}

// ── Canvas ─────────────────────────────────────────────────────────────────────

function drawBoard(
  ctx: CanvasRenderingContext2D, sz: number,
  board: Board, last: [number,number]|null, hover: [number,number]|null
) {
  const cell = (sz - MARGIN*2) / (N-1);
  const rad  = cell * 0.44;
  const px   = (r: number, c: number): [number,number] => [MARGIN+c*cell, MARGIN+r*cell];

  ctx.fillStyle = "#c8a850";
  ctx.fillRect(0, 0, sz, sz);

  ctx.strokeStyle = "#8a6010"; ctx.lineWidth = 1;
  for (let i = 0; i < N; i++) {
    const [x1,y1]=px(0,i), [x2,y2]=px(N-1,i);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    const [x3,y3]=px(i,0), [x4,y4]=px(i,N-1);
    ctx.beginPath(); ctx.moveTo(x3,y3); ctx.lineTo(x4,y4); ctx.stroke();
  }

  ctx.strokeStyle = "#5c3a08"; ctx.lineWidth = 2;
  const [bx,by]=px(0,0), [bx2,by2]=px(N-1,N-1);
  ctx.strokeRect(bx, by, bx2-bx, by2-by);

  ctx.fillStyle = "#5c3a08";
  for (const [r,c] of STARS) {
    const [x,y] = px(r,c);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
  }

  if (hover && board[hover[0]][hover[1]] === EMPTY) {
    const [x,y] = px(hover[0], hover[1]);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI*2); ctx.fill();
  }

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const s = board[r][c];
      if (!s) continue;
      const [x,y] = px(r,c);
      const isB = s === BLACK;

      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.arc(x+1.5, y+2, rad, 0, Math.PI*2); ctx.fill();

      const g = ctx.createRadialGradient(x-rad*.35, y-rad*.38, rad*.05, x, y, rad);
      if (isB) { g.addColorStop(0,"#888"); g.addColorStop(1,"#111"); }
      else     { g.addColorStop(0,"#fff"); g.addColorStop(1,"#ccc"); }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI*2); ctx.fill();

      if (last && last[0]===r && last[1]===c) {
        ctx.fillStyle = isB ? "rgba(255,70,70,.85)" : "rgba(160,20,20,.8)";
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI*2); ctx.fill();
      }
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OmokClient() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const boardRef   = useRef<Board>(newBoard());
  const timerRef   = useRef<number|null>(null);
  const diffRef    = useRef<Diff>("medium");

  const [sz,       setSz]       = useState(400);
  const [board,    setBoard]    = useState<Board>(newBoard);
  const [last,     setLast]     = useState<[number,number]|null>(null);
  const [hover,    setHover]    = useState<[number,number]|null>(null);
  const [status,   setStatus]   = useState<Status>("playing");
  const [thinking, setThinking] = useState(false);
  const [diff,     setDiff]     = useState<Diff>("medium");
  const [moves,    setMoves]    = useState(0);

  useEffect(() => {
    function measure() {
      if (wrapRef.current) setSz(Math.min(wrapRef.current.clientWidth, 480));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (ctx) drawBoard(ctx, sz, board, last, hover);
  }, [board, last, hover, sz]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function reset() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const b = newBoard();
    boardRef.current = b;
    setBoard(newBoard());
    setLast(null); setHover(null); setStatus("playing"); setThinking(false); setMoves(0);
  }

  function toRC(clientX: number, clientY: number): [number,number]|null {
    const cv = canvasRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const cell = (sz - MARGIN*2) / (N-1);
    const scX  = sz / rect.width;
    const scY  = sz / rect.height;
    const r = Math.round(((clientY - rect.top)  * scY - MARGIN) / cell);
    const c = Math.round(((clientX - rect.left) * scX - MARGIN) / cell);
    return inB(r, c) ? [r,c] : null;
  }

  function place(r: number, c: number) {
    const b = boardRef.current;
    if (b[r][c] !== EMPTY) return;
    b[r][c] = BLACK;
    const nm = moves + 1;
    setMoves(nm); setLast([r,c]);
    setBoard(b.map(row => [...row]) as Board);
    if (checkWin(b,r,c,BLACK)) { setStatus("won"); return; }
    if (nm >= N*N)              { setStatus("draw"); return; }
    setThinking(true);
    timerRef.current = window.setTimeout(() => {
      const [ar,ac] = findMove(boardRef.current, diffRef.current);
      const b2 = boardRef.current;
      b2[ar][ac] = WHITE;
      setMoves(m => m+1); setLast([ar,ac]);
      setBoard(b2.map(row => [...row]) as Board);
      if (checkWin(b2,ar,ac,WHITE)) setStatus("lost");
      setThinking(false);
    }, 20);
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (thinking || status !== "playing") return;
    const pos = toRC(e.clientX, e.clientY);
    if (pos) place(pos[0], pos[1]);
  }

  function handleMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (thinking || status !== "playing") { setHover(null); return; }
    setHover(toRC(e.clientX, e.clientY));
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (thinking || status !== "playing") return;
    const t = e.changedTouches[0];
    if (!t) return;
    const pos = toRC(t.clientX, t.clientY);
    if (pos) place(pos[0], pos[1]);
  }

  function changeDiff(d: Diff) {
    diffRef.current = d;
    setDiff(d);
    reset();
  }

  const LABELS: Record<Diff, string> = { easy:"쉬움", medium:"보통", hard:"어려움" };

  return (
    <div className="omok-wrap">
      <div className="omok-header">
        <h2 className="omok-title">오목</h2>
        <div className="omok-diff-row">
          {(["easy","medium","hard"] as Diff[]).map(d => (
            <button
              key={d}
              className={`omok-diff-btn${diff===d?" active":""}`}
              onClick={() => changeDiff(d)}
            >
              {LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="omok-board-wrap">
        <canvas
          ref={canvasRef}
          width={sz}
          height={sz}
          style={{
            width:"100%", height:"auto", display:"block", borderRadius:8,
            cursor: status==="playing"&&!thinking ? "crosshair" : "default",
            touchAction: "none",
          }}
          onClick={handleClick}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
          onTouchEnd={handleTouchEnd}
        />
        {status !== "playing" && (
          <div className="omok-overlay">
            <div className="omok-result">
              <p className="omok-result-icon">
                {status==="won" ? "🎉" : status==="lost" ? "😢" : "🤝"}
              </p>
              <p className="omok-result-label">
                {status==="won" ? "승리!" : status==="lost" ? "패배" : "무승부"}
              </p>
              <button className="solid-button" onClick={reset}>다시 하기</button>
            </div>
          </div>
        )}
      </div>

      <div className="omok-footer">
        <p className={`omok-hint${thinking?" omok-thinking":""}`}>
          {status==="playing"
            ? thinking
              ? "AI 생각 중…"
              : "● 검정 (당신)  ○ 흰색 (AI)"
            : status==="won"
              ? "이겼어요! 🎉"
              : status==="lost"
                ? "AI가 이겼어요"
                : "무승부"}
        </p>
        <button
          className="ghost-button"
          style={{fontSize:13, padding:"6px 16px"}}
          onClick={reset}
        >
          새 게임
        </button>
      </div>
    </div>
  );
}
