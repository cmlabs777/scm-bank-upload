"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────
type PT = "I"|"O"|"T"|"S"|"Z"|"J"|"L";
type Cell = 0 | PT;
type Board = Cell[][];
type Rot = 0|1|2|3;
type Status = "idle"|"playing"|"paused"|"gameover";

interface AP { type: PT; rot: Rot; x: number; y: number; }

interface GS {
  board: Board;
  active: AP | null;
  ghost: AP | null;
  next: PT[];
  hold: PT | null;
  canHold: boolean;
  score: number; level: number; lines: number;
  status: Status;
  dropAcc: number; lockAcc: number; lockMoves: number;
}

// ── Constants ──────────────────────────────────────────────────────────
const COLS = 10, ROWS = 20;
const TYPES: PT[] = ["I","O","T","S","Z","J","L"];

const COLORS: Record<PT,string> = {
  I:"#00f0f0", O:"#f0f000", T:"#a000f0",
  S:"#00f000", Z:"#f00000", J:"#0000f0", L:"#f0a000",
};

// Cell offsets [row,col] for each piece × 4 rotations (screen coords, y↓)
const SHAPES: Record<PT,[number,number][][]> = {
  I:[[[1,0],[1,1],[1,2],[1,3]],[[0,2],[1,2],[2,2],[3,2]],[[2,0],[2,1],[2,2],[2,3]],[[0,1],[1,1],[2,1],[3,1]]],
  O:[[[0,1],[0,2],[1,1],[1,2]],[[0,1],[0,2],[1,1],[1,2]],[[0,1],[0,2],[1,1],[1,2]],[[0,1],[0,2],[1,1],[1,2]]],
  T:[[[0,1],[1,0],[1,1],[1,2]],[[0,1],[1,1],[1,2],[2,1]],[[1,0],[1,1],[1,2],[2,1]],[[0,1],[1,0],[1,1],[2,1]]],
  S:[[[0,1],[0,2],[1,0],[1,1]],[[0,1],[1,1],[1,2],[2,2]],[[1,1],[1,2],[2,0],[2,1]],[[0,0],[1,0],[1,1],[2,1]]],
  Z:[[[0,0],[0,1],[1,1],[1,2]],[[0,2],[1,1],[1,2],[2,1]],[[1,0],[1,1],[2,1],[2,2]],[[0,1],[1,0],[1,1],[2,0]]],
  J:[[[0,0],[1,0],[1,1],[1,2]],[[0,1],[0,2],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,0],[2,1]]],
  L:[[[0,2],[1,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[1,2],[2,0]],[[0,0],[0,1],[1,1],[2,1]]],
};

// SRS wall kick offsets [dx, dy] in screen coords (y↓)
// Key: "fromRot-toRot"
const KJ: Record<string,[number,number][]> = {
  "0-1":[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  "1-2":[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  "2-3":[[0,0],[1,0],[1,-1],[0,2],[1,2]],
  "3-0":[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  "1-0":[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  "2-1":[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  "3-2":[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  "0-3":[[0,0],[1,0],[1,-1],[0,2],[1,2]],
};
const KI: Record<string,[number,number][]> = {
  "0-1":[[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  "1-2":[[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  "2-3":[[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  "3-0":[[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  "1-0":[[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  "2-1":[[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  "3-2":[[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  "0-3":[[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
};

// Drop intervals ms per level (Guideline formula)
function dropMs(level: number) {
  return Math.pow(0.8 - (level - 1) * 0.007, level - 1) * 1000;
}

// Score table: lines cleared → base points (× level)
const LINE_PTS = [0, 100, 300, 500, 800];
const LOCK_DELAY = 500; // ms
const MAX_LOCK_MOVES = 15;

// ── Pure helpers ───────────────────────────────────────────────────────
function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as Cell[]);
}

function cells(type: PT, rot: Rot): [number,number][] {
  return SHAPES[type][rot];
}

function valid(board: Board, type: PT, rot: Rot, x: number, y: number): boolean {
  for (const [dr, dc] of cells(type, rot)) {
    const r = y + dr, c = x + dc;
    if (c < 0 || c >= COLS || r >= ROWS) return false;
    if (r >= 0 && board[r][c] !== 0) return false;
  }
  return true;
}

function ghostY(board: Board, { type, rot, x, y }: AP): number {
  let gy = y;
  while (valid(board, type, rot, x, gy + 1)) gy++;
  return gy;
}

function tryRotate(board: Board, ap: AP, newRot: Rot): AP | null {
  const kicks = ap.type === "I" ? KI : KJ;
  const key = `${ap.rot}-${newRot}`;
  const offsets = kicks[key] ?? [[0,0]];
  for (const [dx, dy] of offsets) {
    const nx = ap.x + dx, ny = ap.y + dy;
    if (valid(board, ap.type, newRot, nx, ny)) {
      return { ...ap, rot: newRot, x: nx, y: ny };
    }
  }
  return null;
}

function lockPiece(board: Board, ap: AP): Board {
  const b = board.map(r => [...r] as Cell[]);
  for (const [dr, dc] of cells(ap.type, ap.rot)) {
    const r = ap.y + dr, c = ap.x + dc;
    if (r >= 0) b[r][c] = ap.type;
  }
  return b;
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const kept = board.filter(row => row.some(c => c === 0));
  const cleared = ROWS - kept.length;
  const empty = Array.from({ length: cleared }, () => Array(COLS).fill(0) as Cell[]);
  return { board: [...empty, ...kept], cleared };
}

// 7-bag randomizer
function makeBag(): PT[] {
  const bag = [...TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function ensureBag(current: PT[]): PT[] {
  if (current.length >= 6) return current;
  return [...current, ...makeBag()];
}

function spawnPiece(type: PT): AP {
  return {
    type, rot: 0,
    x: type === "O" ? 4 : 3,
    y: type === "I" ? -1 : 0,
  };
}

function initialState(): GS {
  const bag = ensureBag(makeBag());
  const type = bag[0];
  const next = bag.slice(1);
  const active = spawnPiece(type);
  return {
    board: emptyBoard(), active,
    ghost: null, // computed lazily
    next, hold: null, canHold: true,
    score: 0, level: 1, lines: 0,
    status: "idle",
    dropAcc: 0, lockAcc: 0, lockMoves: 0,
  };
}

// ── Component ──────────────────────────────────────────────────────────
export default function TetrisClient() {
  const gsRef  = useRef<GS>(initialState());   // mutable game state — never read during render
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const [snap, setSnap] = useState<GS>(initialState); // render snapshot (separate init)

  const push = useCallback(() => setSnap({ ...gsRef.current }), []);

  // Compute ghost and push snapshot
  const sync = useCallback(() => {
    const s = gsRef.current;
    if (s.active) {
      const gy = ghostY(s.board, s.active);
      gsRef.current = { ...s, ghost: { ...s.active, y: gy } };
    }
    push();
  }, [push]);

  // ── Spawn next piece ────────────────────────────────────────────────
  const spawnNext = useCallback(() => {
    const s = gsRef.current;
    let bag = ensureBag(s.next);
    const type = bag[0];
    bag = bag.slice(1);
    const active = spawnPiece(type);
    if (!valid(s.board, active.type, active.rot, active.x, active.y)) {
      gsRef.current = { ...s, active: null, ghost: null, next: bag, status: "gameover" };
    } else {
      gsRef.current = {
        ...s, active, next: bag, ghost: null,
        canHold: true, dropAcc: 0, lockAcc: 0, lockMoves: 0,
      };
    }
    sync();
  }, [sync]);

  // ── Lock current piece ───────────────────────────────────────────────
  const lock = useCallback(() => {
    const s = gsRef.current;
    if (!s.active) return;
    const locked = lockPiece(s.board, s.active);
    const { board, cleared } = clearLines(locked);
    const lines = s.lines + cleared;
    const level = Math.max(s.level, Math.floor(lines / 10) + 1);
    const score = s.score + LINE_PTS[cleared] * s.level;
    gsRef.current = { ...s, board, score, level, lines, active: null };
    spawnNext();
  }, [spawnNext]);

  // ── Move ─────────────────────────────────────────────────────────────
  const moveLeft  = useCallback(() => {
    const s = gsRef.current;
    if (!s.active || s.status !== "playing") return;
    if (valid(s.board, s.active.type, s.active.rot, s.active.x - 1, s.active.y)) {
      gsRef.current = { ...s, active: { ...s.active, x: s.active.x - 1 }, lockAcc: 0, lockMoves: s.lockMoves + 1 };
      sync();
    }
  }, [sync]);

  const moveRight = useCallback(() => {
    const s = gsRef.current;
    if (!s.active || s.status !== "playing") return;
    if (valid(s.board, s.active.type, s.active.rot, s.active.x + 1, s.active.y)) {
      gsRef.current = { ...s, active: { ...s.active, x: s.active.x + 1 }, lockAcc: 0, lockMoves: s.lockMoves + 1 };
      sync();
    }
  }, [sync]);

  const softDrop = useCallback(() => {
    const s = gsRef.current;
    if (!s.active || s.status !== "playing") return;
    if (valid(s.board, s.active.type, s.active.rot, s.active.x, s.active.y + 1)) {
      gsRef.current = { ...s, active: { ...s.active, y: s.active.y + 1 }, dropAcc: 0, score: s.score + 1 };
      sync();
    } else { lock(); }
  }, [sync, lock]);

  const hardDrop = useCallback(() => {
    const s = gsRef.current;
    if (!s.active || s.status !== "playing") return;
    const gy = ghostY(s.board, s.active);
    const dropped = gy - s.active.y;
    gsRef.current = { ...s, active: { ...s.active, y: gy }, score: s.score + dropped * 2, dropAcc: 0 };
    lock();
  }, [lock]);

  const rotateCW  = useCallback(() => {
    const s = gsRef.current;
    if (!s.active || s.status !== "playing") return;
    const newRot = ((s.active.rot + 1) % 4) as Rot;
    const res = tryRotate(s.board, s.active, newRot);
    if (res) { gsRef.current = { ...s, active: res, lockAcc: 0, lockMoves: s.lockMoves + 1 }; sync(); }
  }, [sync]);

  const rotateCCW = useCallback(() => {
    const s = gsRef.current;
    if (!s.active || s.status !== "playing") return;
    const newRot = ((s.active.rot + 3) % 4) as Rot;
    const res = tryRotate(s.board, s.active, newRot);
    if (res) { gsRef.current = { ...s, active: res, lockAcc: 0, lockMoves: s.lockMoves + 1 }; sync(); }
  }, [sync]);

  const holdPiece = useCallback(() => {
    const s = gsRef.current;
    if (!s.active || !s.canHold || s.status !== "playing") return;
    const type = s.active.type;
    if (s.hold) {
      const active = spawnPiece(s.hold);
      gsRef.current = { ...s, active, hold: type, canHold: false, dropAcc: 0, lockAcc: 0 };
      sync();
    } else {
      gsRef.current = { ...s, active: null, hold: type, canHold: false };
      spawnNext();
    }
  }, [sync, spawnNext]);

  const togglePause = useCallback(() => {
    const s = gsRef.current;
    if (s.status === "playing") gsRef.current = { ...s, status: "paused" };
    else if (s.status === "paused") gsRef.current = { ...s, status: "playing" };
    push();
  }, [push]);

  const startGame = useCallback(() => {
    gsRef.current = { ...initialState(), status: "playing" };
    sync();
  }, [sync]);

  // ── Game loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    function loop(time: number) {
      const dt = Math.min(time - lastRef.current, 50); // cap at 50ms
      lastRef.current = time;
      const s = gsRef.current;

      if (s.status === "playing" && s.active) {
        const interval = dropMs(s.level);
        const newDropAcc = s.dropAcc + dt;

        if (newDropAcc >= interval) {
          // Attempt gravity drop
          if (valid(s.board, s.active.type, s.active.rot, s.active.x, s.active.y + 1)) {
            gsRef.current = { ...s, active: { ...s.active, y: s.active.y + 1 }, dropAcc: newDropAcc - interval, lockAcc: 0 };
            sync();
          } else {
            // Piece is on surface — accumulate lock delay
            const newLockAcc = s.lockAcc + dt;
            if (newLockAcc >= LOCK_DELAY || s.lockMoves >= MAX_LOCK_MOVES) {
              lock();
            } else {
              gsRef.current = { ...s, dropAcc: newDropAcc, lockAcc: newLockAcc };
            }
          }
        } else {
          // No drop, but check if on surface for lock delay
          if (!valid(s.board, s.active.type, s.active.rot, s.active.x, s.active.y + 1)) {
            const newLockAcc = s.lockAcc + dt;
            if (newLockAcc >= LOCK_DELAY || s.lockMoves >= MAX_LOCK_MOVES) {
              lock();
            } else {
              gsRef.current = { ...s, dropAcc: newDropAcc, lockAcc: newLockAcc };
            }
          } else {
            gsRef.current = { ...s, dropAcc: newDropAcc };
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [lock, sync]);

  // ── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const held = new Set<string>();
    const REPEAT_DELAY = 180, REPEAT_INTERVAL = 50;
    const timers: Record<string, ReturnType<typeof setInterval>> = {};

    function startRepeat(key: string, fn: () => void) {
      fn();
      timers[key] = setTimeout(() => {
        timers[key] = setInterval(fn, REPEAT_INTERVAL);
      }, REPEAT_DELAY);
    }

    function stopRepeat(key: string) {
      clearTimeout(timers[key]);
      clearInterval(timers[key]);
      delete timers[key];
    }

    function onDown(e: KeyboardEvent) {
      if (held.has(e.code)) return;
      held.add(e.code);
      if (gsRef.current.status === "idle" || gsRef.current.status === "gameover") {
        if (e.code === "Space" || e.code === "Enter") { startGame(); return; }
      }
      switch (e.code) {
        case "ArrowLeft":  e.preventDefault(); startRepeat("left",  moveLeft);  break;
        case "ArrowRight": e.preventDefault(); startRepeat("right", moveRight); break;
        case "ArrowDown":  e.preventDefault(); startRepeat("down",  softDrop);  break;
        case "ArrowUp": case "KeyX": e.preventDefault(); rotateCW();  break;
        case "KeyZ":   e.preventDefault(); rotateCCW(); break;
        case "Space":  e.preventDefault(); hardDrop();  break;
        case "KeyC": case "ShiftLeft": e.preventDefault(); holdPiece(); break;
        case "Escape": case "KeyP": e.preventDefault(); togglePause(); break;
      }
    }

    function onUp(e: KeyboardEvent) {
      held.delete(e.code);
      if (e.code === "ArrowLeft")  stopRepeat("left");
      if (e.code === "ArrowRight") stopRepeat("right");
      if (e.code === "ArrowDown")  stopRepeat("down");
    }

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      Object.keys(timers).forEach(k => { clearTimeout(timers[k]); clearInterval(timers[k]); });
    };
  }, [moveLeft, moveRight, softDrop, hardDrop, rotateCW, rotateCCW, holdPiece, togglePause, startGame]);

  // ── Render helpers ────────────────────────────────────────────────────
  function renderBoard() {
    const { board, active, ghost } = snap;
    // Build display grid
    const grid: Cell[][] = board.map(r => [...r] as Cell[]);

    // Paint ghost
    if (active && ghost && ghost.y !== active.y) {
      for (const [dr, dc] of cells(active.type, active.rot)) {
        const r = ghost.y + dr, c = ghost.x + dc;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === 0) {
          grid[r][c] = ("ghost-" + active.type) as Cell;
        }
      }
    }

    // Paint active
    if (active) {
      for (const [dr, dc] of cells(active.type, active.rot)) {
        const r = active.y + dr, c = active.x + dc;
        if (r >= 0 && r < ROWS) grid[r][c] = active.type;
      }
    }

    return grid.map((row, r) =>
      row.map((cell, c) => {
        const isGhost = typeof cell === "string" && cell.startsWith("ghost-");
        const type = isGhost ? (cell.slice(6) as PT) : (cell as PT | 0);
        const color = type !== 0 ? COLORS[type as PT] : null;
        return (
          <div key={`${r}-${c}`} className="tet-cell" style={{
            background: isGhost ? "transparent" : (color ?? "transparent"),
            borderColor: isGhost ? (color ?? "transparent") : "transparent",
            borderWidth: isGhost ? 2 : 0,
            borderStyle: "solid",
            boxShadow: color && !isGhost ? `inset 0 2px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.25)` : "none",
          }}/>
        );
      })
    );
  }

  function renderMini(type: PT | null) {
    if (!type) return <div className="tet-mini-empty"/>;
    const s = SHAPES[type][0];
    const rows = Math.max(...s.map(([r]) => r)) + 1;
    const cols = Math.max(...s.map(([,c]) => c)) + 1;
    const grid: (PT|0)[][] = Array.from({length: rows}, () => Array(cols).fill(0));
    for (const [r,c] of s) grid[r][c] = type;
    return (
      <div className="tet-mini" style={{gridTemplateColumns: `repeat(${cols}, 1fr)`}}>
        {grid.flat().map((cell, i) => (
          <div key={i} className="tet-mini-cell" style={{
            background: cell ? COLORS[cell] : "transparent",
            boxShadow: cell ? `inset 0 1px 0 rgba(255,255,255,0.25)` : "none",
          }}/>
        ))}
      </div>
    );
  }

  const { status, score, level, lines, hold, next } = snap;

  return (
    <div className="tet-wrap">
      {/* ── 타이틀 바 ── */}
      <div className="page-header" style={{marginBottom:12}}>
        <h1>테트리스</h1>
        <span style={{fontSize:13,color:"var(--text-muted)"}}>
          {status === "playing" ? `Lv.${level}` : status === "paused" ? "⏸ 일시정지" : ""}
        </span>
      </div>

      <div className="tet-layout">
        {/* ── 왼쪽: HOLD + SCORE ── */}
        <div className="tet-side tet-side-left">
          <div className="tet-panel">
            <div className="tet-panel-label">HOLD</div>
            {renderMini(hold)}
          </div>
          <div className="tet-panel">
            <div className="tet-panel-label">SCORE</div>
            <div className="tet-stat">{score.toLocaleString()}</div>
            <div className="tet-panel-label" style={{marginTop:8}}>LINES</div>
            <div className="tet-stat">{lines}</div>
            <div className="tet-panel-label" style={{marginTop:8}}>LEVEL</div>
            <div className="tet-stat">{level}</div>
          </div>
        </div>

        {/* ── 보드 ── */}
        <div className="tet-board-wrap">
          <div className="tet-board" style={{gridTemplateColumns:`repeat(${COLS},1fr)`}}>
            {(status === "idle" || status === "gameover") ? (
              <div className="tet-overlay" style={{gridColumn:`1/${COLS+1}`,gridRow:`1/${ROWS+1}`}}>
                {status === "gameover" && <p className="tet-overlay-sub">GAME OVER</p>}
                <p className="tet-overlay-score">{status === "gameover" ? score.toLocaleString() : ""}</p>
                <button className="solid-button" onClick={startGame} style={{marginTop:8}}>
                  {status === "gameover" ? "다시 시작" : "시작"}
                </button>
                <p className="tet-overlay-hint">Space · Enter</p>
              </div>
            ) : status === "paused" ? (
              <div className="tet-overlay" style={{gridColumn:`1/${COLS+1}`,gridRow:`1/${ROWS+1}`}}>
                <p className="tet-overlay-sub">PAUSED</p>
                <button className="solid-button" onClick={togglePause} style={{marginTop:8}}>계속하기</button>
              </div>
            ) : null}
            {renderBoard()}
          </div>
        </div>

        {/* ── 오른쪽: NEXT ── */}
        <div className="tet-side tet-side-right">
          <div className="tet-panel">
            <div className="tet-panel-label">NEXT</div>
            {next.slice(0, 3).map((t, i) => (
              <div key={i} style={{marginBottom: 8}}>{renderMini(t)}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 모바일 컨트롤 ── */}
      <div className="tet-controls">
        <div className="tet-ctrl-row">
          <button className="tet-btn" onPointerDown={holdPiece}>HOLD<br/><span>C</span></button>
          <button className="tet-btn tet-btn-wide" onPointerDown={rotateCCW}>↺<br/><span>Z</span></button>
          <button className="tet-btn tet-btn-wide" onPointerDown={rotateCW}>↻<br/><span>↑</span></button>
          <button className="tet-btn" onPointerDown={togglePause}>⏸<br/><span>P</span></button>
        </div>
        <div className="tet-ctrl-row">
          <button className="tet-btn tet-btn-xl" onPointerDown={moveLeft}>◀<br/><span>←</span></button>
          <button className="tet-btn tet-btn-xl" onPointerDown={softDrop}>▼<br/><span>↓</span></button>
          <button className="tet-btn tet-btn-xl" onPointerDown={moveRight}>▶<br/><span>→</span></button>
        </div>
        <div className="tet-ctrl-row">
          <button className="tet-btn tet-btn-hard" onPointerDown={hardDrop}>HARD DROP ⬇⬇<br/><span>Space</span></button>
        </div>
      </div>
    </div>
  );
}
