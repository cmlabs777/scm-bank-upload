"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stage = "setup" | "running" | "done";

interface BallRun {
  id: number;
  owner: string;
  color: string;
  path: string;
  slot: number;
  duration: number;
  delay: number;
  finishAt: number;
}

interface ResultRow {
  rank: number;
  owner: string;
  prize: string;
  color: string;
}

const MIN_BALLS = 2;
const MAX_BALLS = 8;
const WIDTH = 760;
const HEIGHT = 520;
const TOP_Y = 42;
const BOARD_TOP = 108;
const BOARD_BOTTOM = 398;
const SLOT_TOP = 418;
const SIDE = 58;
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

function makePath(index: number, count: number, slot: number) {
  const startX = slotX(index, count);
  const endX = slotX(slot, count);
  const rows = 7;
  const points = [[startX, TOP_Y]];

  for (let row = 0; row < rows; row += 1) {
    const progress = (row + 1) / rows;
    const y = BOARD_TOP + progress * (BOARD_BOTTOM - BOARD_TOP);
    const drift = (endX - startX) * progress;
    const wave = (pseudo(index * 17 + row * 9 + count) - 0.5) * 88;
    const x = Math.max(SIDE, Math.min(WIDTH - SIDE, startX + drift + wave));
    points.push([x, y]);
  }

  points.push([endX, SLOT_TOP + 22]);

  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

function makeRuns(owners: string[], prizes: string[]): { runs: BallRun[]; results: ResultRow[] } {
  const count = owners.length;
  const usedSlots = Array.from({ length: count }, (_, i) => i).sort(() => Math.random() - 0.5);
  const runs = owners.map((owner, index) => {
    const duration = 1.65 + Math.random() * 1.1;
    const delay = index * 0.14 + Math.random() * 0.18;
    const slot = usedSlots[index] ?? index;

    return {
      id: Date.now() + index,
      owner,
      color: COLORS[index % COLORS.length],
      path: makePath(index, count, slot),
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
    }));

  return { runs, results };
}

function pegRows(count: number) {
  return Array.from({ length: 7 }, (_, row) => {
    const pegCount = count + (row % 2 === 0 ? 1 : 2);
    return Array.from({ length: pegCount }, (_, col) => {
      const rowWidth = WIDTH - SIDE * 2;
      const x = SIDE + (col * rowWidth) / Math.max(1, pegCount - 1);
      const offset = row % 2 === 0 ? 0 : rowWidth / Math.max(8, count * 3);
      return {
        x: Math.max(SIDE, Math.min(WIDTH - SIDE, x - offset)),
        y: BOARD_TOP + ((row + 0.5) * (BOARD_BOTTOM - BOARD_TOP)) / 7,
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
  const [visibleResults, setVisibleResults] = useState(0);
  const timers = useRef<number[]>([]);

  const pegs = useMemo(() => pegRows(count), [count]);
  const canStart = owners.every(item => item.trim()) && prizes.every(item => item.trim());

  useEffect(() => () => clearTimers(), []);

  function clearTimers() {
    timers.current.forEach(timer => window.clearTimeout(timer));
    timers.current = [];
  }

  function changeCount(value: number) {
    const next = clampCount(value);
    setCount(next);
    setOwners(prev => Array.from({ length: next }, (_, i) => prev[i] || DEFAULT_OWNERS[i] || `공 ${i + 1}`));
    setPrizes(prev => Array.from({ length: next }, (_, i) => prev[i] || DEFAULT_PRIZES[i] || `${i + 1}등`));
    reset();
  }

  function reset() {
    clearTimers();
    setStage("setup");
    setRuns([]);
    setResults([]);
    setVisibleResults(0);
  }

  function updateOwner(index: number, value: string) {
    setOwners(prev => prev.map((item, i) => (i === index ? value : item)));
  }

  function updatePrize(index: number, value: string) {
    setPrizes(prev => prev.map((item, i) => (i === index ? value : item)));
  }

  function start() {
    if (!canStart) return;
    clearTimers();

    const game = makeRuns(owners.map(item => item.trim()), prizes.map(item => item.trim()));
    setRuns(game.runs);
    setResults(game.results);
    setVisibleResults(0);
    setStage("running");

    const orderedFinishTimes = [...game.runs].sort((a, b) => a.finishAt - b.finishAt).map(run => run.finishAt);
    orderedFinishTimes.forEach((time, index) => {
      const timer = window.setTimeout(() => {
        setVisibleResults(index + 1);
        if (index === orderedFinishTimes.length - 1) setStage("done");
      }, time * 1000);
      timers.current.push(timer);
    });
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
            <h2>결과</h2>
            {stage === "done" && <span className="badge badge-income">완료</span>}
          </div>

          <div className="plinko-board">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="plinko-svg" role="img" aria-label="공굴리기 보드">
              <defs>
                {runs.map(run => (
                  <path key={`path-${run.id}`} id={`plinko-path-${run.id}`} d={run.path} />
                ))}
              </defs>

              <rect className="plinko-backdrop" x="18" y="18" width={WIDTH - 36} height={HEIGHT - 36} rx="28" />

              {pegs.map((peg, index) => (
                <circle key={`peg-${index}`} className="plinko-peg" cx={peg.x} cy={peg.y} r="8" />
              ))}

              {Array.from({ length: count }, (_, index) => (
                <g key={`slot-${index}`}>
                  <rect
                    className="plinko-slot"
                    x={slotX(index, count) - Math.min(52, 220 / count)}
                    y={SLOT_TOP + 22}
                    width={Math.min(104, 440 / count)}
                    height="52"
                    rx="14"
                  />
                  <text className="plinko-slot-text" x={slotX(index, count)} y={SLOT_TOP + 54} textAnchor="middle">{index + 1}</text>
                </g>
              ))}

              {runs.length === 0 && (
                <text className="plinko-empty-text" x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle">
                  Start를 누르면 공이 내려갑니다
                </text>
              )}

              {runs.map(run => (
                <g key={run.id}>
                  <circle className="plinko-ball-shadow" r="16" fill={run.color} opacity=".18">
                    <animateMotion dur={`${run.duration}s`} begin={`${run.delay}s`} fill="freeze" path={run.path} />
                  </circle>
                  <circle className="plinko-ball" r="13" fill={run.color}>
                    <animateMotion dur={`${run.duration}s`} begin={`${run.delay}s`} fill="freeze" path={run.path} />
                  </circle>
                </g>
              ))}
            </svg>
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
