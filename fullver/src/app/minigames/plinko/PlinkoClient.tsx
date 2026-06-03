"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stage = "setup" | "running" | "done";

interface Point {
  x: number;
  y: number;
}

interface BallRun {
  id: number;
  owner: string;
  color: string;
  points: Point[];
  path: string;
  slot: number;
  duration: number;
  delay: number;
  finishAt: number;
}

interface BallView {
  id: number;
  owner: string;
  color: string;
  x: number;
  y: number;
  progress: number;
}

interface ResultRow {
  rank: number;
  owner: string;
  prize: string;
  color: string;
  finishAt: number;
}

const MIN_BALLS = 2;
const MAX_BALLS = 8;
const WIDTH = 760;
const HEIGHT = 560;
const TOP_Y = 64;
const BOARD_TOP = 116;
const BOARD_BOTTOM = 420;
const SLOT_TOP = 438;
const SIDE = 62;
const COLORS = ["#c4572a", "#1a73e8", "#1e8e3e", "#7c3aed", "#be185d", "#0891b2", "#b45309", "#4b5563"];
const DEFAULT_OWNERS = ["나", "배우자", "손님 1", "손님 2", "손님 3", "손님 4", "손님 5", "손님 6"];
const DEFAULT_PRIZES = ["치킨", "초밥", "파스타", "김치찌개", "쌀국수", "햄버거", "떡볶이", "샐러드"];

function clampCount(value: number) {
  return Math.min(MAX_BALLS, Math.max(MIN_BALLS, value));
}

function initialItems(source: string[], count: number) {
  return Array.from({ length: count }, (_, i) => source[i] || `${i + 1}`);
}

function slotX(index: number, count: number) {
  if (count === 1) return WIDTH / 2;
  return SIDE + (index * (WIDTH - SIDE * 2)) / (count - 1);
}

function pseudo(seed: number) {
  const x = Math.sin(seed * 999.19) * 10000;
  return x - Math.floor(x);
}

function pointsToPath(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function easeDrop(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.72
    ? clamped * clamped * (2.05 - clamped)
    : 1 - Math.pow(1 - clamped, 2.4);
}

function pointAt(points: Point[], progress: number) {
  if (points.length <= 1) return points[0] || { x: WIDTH / 2, y: TOP_Y };

  const lengths = points.slice(1).map((point, index) => distance(points[index], point));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  let target = Math.max(0, Math.min(total, total * progress));

  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i]) {
      const from = points[i];
      const to = points[i + 1];
      const ratio = lengths[i] === 0 ? 0 : target / lengths[i];
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
    }
    target -= lengths[i];
  }

  return points[points.length - 1];
}

function makePoints(index: number, count: number, slot: number) {
  const startX = slotX(index, count);
  const endX = slotX(slot, count);
  const rows = 9;
  const points: Point[] = [{ x: startX, y: TOP_Y }];

  for (let row = 0; row < rows; row += 1) {
    const progress = (row + 1) / rows;
    const y = BOARD_TOP + progress * (BOARD_BOTTOM - BOARD_TOP);
    const drift = (endX - startX) * progress;
    const sideHit = (pseudo(index * 41 + row * 13 + count) > 0.5 ? 1 : -1) * (42 + pseudo(row * 7 + index) * 34);
    const wobble = Math.sin((row + 1) * 1.7 + index) * 24;
    const x = Math.max(SIDE, Math.min(WIDTH - SIDE, startX + drift + sideHit + wobble));
    points.push({ x, y });
  }

  points.push({ x: endX, y: SLOT_TOP + 18 });
  points.push({ x: endX, y: SLOT_TOP + 46 });
  return points;
}

function makeRuns(owners: string[], prizes: string[]): { runs: BallRun[]; results: ResultRow[] } {
  const count = owners.length;
  const slots = Array.from({ length: count }, (_, i) => i).sort(() => Math.random() - 0.5);
  const now = Date.now();
  const runs = owners.map((owner, index) => {
    const duration = 2.45 + Math.random() * 1.15;
    const delay = index * 0.28 + Math.random() * 0.16;
    const slot = slots[index] ?? index;
    const points = makePoints(index, count, slot);

    return {
      id: now + index,
      owner,
      color: COLORS[index % COLORS.length],
      points,
      path: pointsToPath(points),
      slot,
      duration,
      delay,
      finishAt: duration + delay,
    };
  });

  const results = [...runs]
    .sort((a, b) => a.finishAt - b.finishAt)
    .map((run, index) => ({
      rank: index + 1,
      owner: run.owner,
      prize: prizes[index] || `${index + 1}등`,
      color: run.color,
      finishAt: run.finishAt,
    }));

  return { runs, results };
}

function pegRows(count: number) {
  return Array.from({ length: 8 }, (_, row) => {
    const pegCount = count + (row % 2 === 0 ? 2 : 3);
    return Array.from({ length: pegCount }, (_, col) => {
      const rowWidth = WIDTH - SIDE * 2;
      const x = SIDE + (col * rowWidth) / Math.max(1, pegCount - 1);
      const offset = row % 2 === 0 ? 0 : rowWidth / Math.max(9, count * 3);
      return {
        x: Math.max(SIDE, Math.min(WIDTH - SIDE, x - offset)),
        y: BOARD_TOP + ((row + 0.58) * (BOARD_BOTTOM - BOARD_TOP)) / 8,
      };
    });
  }).flat();
}

export default function PlinkoClient() {
  const [count, setCount] = useState(3);
  const [owners, setOwners] = useState(() => initialItems(DEFAULT_OWNERS, 3));
  const [prizes, setPrizes] = useState(() => initialItems(DEFAULT_PRIZES, 3));
  const [stage, setStage] = useState<Stage>("setup");
  const [runs, setRuns] = useState<BallRun[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [balls, setBalls] = useState<BallView[]>([]);
  const [visibleResults, setVisibleResults] = useState(0);
  const raf = useRef<number | null>(null);
  const startTime = useRef(0);

  const pegs = useMemo(() => pegRows(count), [count]);
  const canStart = owners.every(item => item.trim()) && prizes.every(item => item.trim());

  useEffect(() => () => stopAnimation(), []);

  function stopAnimation() {
    if (raf.current !== null) {
      window.cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }

  function changeCount(value: number) {
    const next = clampCount(value);
    setCount(next);
    setOwners(prev => Array.from({ length: next }, (_, i) => prev[i] || DEFAULT_OWNERS[i] || `공 ${i + 1}`));
    setPrizes(prev => Array.from({ length: next }, (_, i) => prev[i] || DEFAULT_PRIZES[i] || `${i + 1}등`));
    reset();
  }

  function reset() {
    stopAnimation();
    setStage("setup");
    setRuns([]);
    setResults([]);
    setBalls([]);
    setVisibleResults(0);
  }

  function updateOwner(index: number, value: string) {
    setOwners(prev => prev.map((item, i) => (i === index ? value : item)));
  }

  function updatePrize(index: number, value: string) {
    setPrizes(prev => prev.map((item, i) => (i === index ? value : item)));
  }

  function animate(nextRuns: BallRun[], nextResults: ResultRow[]) {
    const elapsed = (performance.now() - startTime.current) / 1000;
    const nextBalls = nextRuns.map(run => {
      const local = (elapsed - run.delay) / run.duration;
      const progress = Math.max(0, Math.min(1, easeDrop(local)));
      const point = pointAt(run.points, progress);
      return { id: run.id, owner: run.owner, color: run.color, progress, ...point };
    });

    setBalls(nextBalls);
    setVisibleResults(nextResults.filter(result => elapsed >= result.finishAt).length);

    if (elapsed < Math.max(...nextRuns.map(run => run.finishAt)) + 0.35) {
      raf.current = window.requestAnimationFrame(() => animate(nextRuns, nextResults));
    } else {
      setVisibleResults(nextResults.length);
      setStage("done");
      raf.current = null;
    }
  }

  function start() {
    if (!canStart) return;
    stopAnimation();

    const game = makeRuns(owners.map(item => item.trim()), prizes.map(item => item.trim()));
    const initialBalls = game.runs.map(run => {
      const point = pointAt(run.points, 0);
      return { id: run.id, owner: run.owner, color: run.color, progress: 0, ...point };
    });

    setRuns(game.runs);
    setResults(game.results);
    setBalls(initialBalls);
    setVisibleResults(0);
    setStage("running");
    startTime.current = performance.now();
    raf.current = window.requestAnimationFrame(() => animate(game.runs, game.results));
  }

  return (
    <div className="plinko-page">
      <div className="page-header">
        <h1>공굴리기</h1>
      </div>

      <div className="plinko-layout">
        <section className="panel plinko-setup">
          <h2>저녁 메뉴 공굴리기</h2>
          <p className="hint-text">공 갯수와 누구 공인지 입력하고, 먼저 도착한 순서대로 받을 당첨 항목을 적어주세요.</p>

          <div className="plinko-counts" aria-label="공 갯수">
            {Array.from({ length: MAX_BALLS - MIN_BALLS + 1 }, (_, i) => i + MIN_BALLS).map(value => (
              <button
                type="button"
                key={value}
                className={`plinko-count-btn${count === value ? " active" : ""}`}
                onClick={() => changeCount(value)}
              >
                {value}개
              </button>
            ))}
          </div>

          <div className="plinko-input-block">
            <div className="plinko-input-head">
              <span>공</span>
              <strong>누구 공인지</strong>
            </div>
            <div className="plinko-input-grid">
              {owners.map((owner, index) => (
                <input
                  key={`owner-${index}`}
                  value={owner}
                  onChange={e => updateOwner(index, e.target.value)}
                  placeholder={`공 ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="plinko-input-block">
            <div className="plinko-input-head">
              <span>순</span>
              <strong>당첨 순서</strong>
            </div>
            <div className="plinko-input-grid">
              {prizes.map((prize, index) => (
                <input
                  key={`prize-${index}`}
                  value={prize}
                  onChange={e => updatePrize(index, e.target.value)}
                  placeholder={`${index + 1}등 당첨`}
                />
              ))}
            </div>
          </div>

          <div className="plinko-actions">
            <button type="button" className="solid-button" onClick={start} disabled={!canStart || stage === "running"}>
              {stage === "running" ? "굴리는 중" : "Start"}
            </button>
            <button type="button" className="ghost-button" onClick={reset}>초기화</button>
          </div>
        </section>

        <section className="panel plinko-board-panel">
          <div className="plinko-board-head">
            <div>
              <h2>라이브 보드</h2>
              <p>{stage === "running" ? "공이 내려가는 중입니다" : stage === "done" ? "도착 순서가 확정됐어요" : "Start를 누르면 시작됩니다"}</p>
            </div>
            {stage === "done" && <span className="badge badge-income">완료</span>}
          </div>

          <div className="plinko-stage-card">
            <div className="plinko-score-strip">
              <span>FINISH ORDER</span>
              <strong>{visibleResults}/{count}</strong>
            </div>

            <div className="plinko-board">
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="plinko-svg" role="img" aria-label="공굴리기 보드">
                <defs>
                  <radialGradient id="plinkoGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fff7ed" />
                    <stop offset="70%" stopColor="#f8d8c8" />
                    <stop offset="100%" stopColor="#c4572a" />
                  </radialGradient>
                  <linearGradient id="plinkoPanel" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#fffaf5" />
                    <stop offset="48%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#f4f7fb" />
                  </linearGradient>
                </defs>

                <rect className="plinko-backdrop" x="18" y="18" width={WIDTH - 36} height={HEIGHT - 36} rx="34" />
                <rect className="plinko-top-rail" x="88" y="38" width={WIDTH - 176} height="42" rx="21" />
                <text className="plinko-top-text" x={WIDTH / 2} y="65" textAnchor="middle">DROP ZONE</text>

                {runs.map(run => (
                  <path key={`trail-${run.id}`} className="plinko-trail" d={run.path} style={{ stroke: run.color }} />
                ))}

                {pegs.map((peg, index) => (
                  <g key={`peg-${index}`}>
                    <circle className="plinko-peg-halo" cx={peg.x} cy={peg.y} r="14" />
                    <circle className="plinko-peg" cx={peg.x} cy={peg.y} r="7" />
                  </g>
                ))}

                {Array.from({ length: count }, (_, index) => (
                  <g key={`slot-${index}`}>
                    <rect
                      className="plinko-slot"
                      x={slotX(index, count) - Math.min(52, 220 / count)}
                      y={SLOT_TOP + 30}
                      width={Math.min(104, 440 / count)}
                      height="58"
                      rx="15"
                    />
                    <text className="plinko-slot-text" x={slotX(index, count)} y={SLOT_TOP + 66} textAnchor="middle">{index + 1}</text>
                  </g>
                ))}

                {balls.length === 0 && (
                  <g>
                    <circle className="plinko-preview-ball" cx={WIDTH / 2} cy={HEIGHT / 2 - 18} r="25" />
                    <text className="plinko-empty-text" x={WIDTH / 2} y={HEIGHT / 2 + 34} textAnchor="middle">
                      공이 굴러갈 준비가 됐어요
                    </text>
                  </g>
                )}

                {balls.map(ball => (
                  <g key={ball.id} className="plinko-ball-group">
                    <circle className="plinko-ball-shadow" cx={ball.x + 4} cy={ball.y + 6} r="18" fill={ball.color} opacity=".16" />
                    <circle className="plinko-ball-ring" cx={ball.x} cy={ball.y} r="19" fill="none" style={{ stroke: ball.color }} />
                    <circle className="plinko-ball" cx={ball.x} cy={ball.y} r="14" fill={ball.color} />
                    <text className="plinko-ball-label" x={ball.x} y={ball.y + 4} textAnchor="middle">{ball.owner.slice(0, 1)}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="plinko-results">
            {results.length === 0 ? (
              <div className="plinko-result-empty">먼저 떨어진 공부터 당첨 순서가 배정됩니다.</div>
            ) : results.map((result, index) => (
              <div key={`${result.owner}-${result.rank}`} className={`plinko-result${index < visibleResults ? " revealed" : ""}`}>
                <span className="plinko-rank">{result.rank}</span>
                <span className="plinko-owner" style={{ color: result.color }}>{index < visibleResults ? result.owner : "?"}</span>
                <span className="plinko-arrow">→</span>
                <strong>{index < visibleResults ? result.prize : "대기"}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
