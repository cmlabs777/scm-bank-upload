"use client";

import { useEffect, useMemo, useState } from "react";

type Stage = "setup" | "playing" | "done";

interface LadderGame {
  players: string[];
  prizes: string[];
  rungs: number[][];
  routes: number[][][];
  results: number[];
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const DEFAULT_PLAYERS = ["나", "배우자", "손님 1", "손님 2", "손님 3", "손님 4", "손님 5", "손님 6"];
const DEFAULT_PRIZES = ["치킨", "파스타", "초밥", "김치찌개", "햄버거", "쌀국수", "떡볶이", "샐러드"];
const COLORS = ["#c4572a", "#1a73e8", "#1e8e3e", "#7c3aed", "#be185d", "#0891b2", "#b45309", "#4b5563"];
const SVG_WIDTH = 920;
const SVG_HEIGHT = 500;
const TOP = 62;
const BOTTOM = 438;
const SIDE = 70;

function clampCount(count: number) {
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, count));
}

function makeInitialItems(seed: string[], count: number) {
  return Array.from({ length: count }, (_, i) => seed[i] || `${i + 1}`);
}

function xAt(index: number, count: number) {
  if (count === 1) return SVG_WIDTH / 2;
  return SIDE + (index * (SVG_WIDTH - SIDE * 2)) / (count - 1);
}

function yAt(row: number, totalRows: number) {
  return TOP + ((row + 1) * (BOTTOM - TOP)) / (totalRows + 1);
}

function generateRungs(count: number) {
  const rows = Math.max(10, count + 7);
  const rungs: number[][] = [];

  for (let row = 0; row < rows; row += 1) {
    const current: number[] = [];
    for (let col = 0; col < count - 1; col += 1) {
      const prevIsAdjacent = current.includes(col - 1);
      const chance = row % 3 === 1 ? 0.48 : 0.38;
      if (!prevIsAdjacent && Math.random() < chance) current.push(col);
    }
    if (current.length === 0 && Math.random() < 0.55) {
      current.push(Math.floor(Math.random() * (count - 1)));
    }
    rungs.push(current);
  }

  return rungs;
}

function traceRoute(start: number, count: number, rungs: number[][]) {
  let col = start;
  const points: number[][] = [[xAt(col, count), TOP]];

  rungs.forEach((rowRungs, row) => {
    const y = yAt(row, rungs.length);
    points.push([xAt(col, count), y]);

    if (rowRungs.includes(col)) {
      col += 1;
      points.push([xAt(col, count), y]);
    } else if (rowRungs.includes(col - 1)) {
      col -= 1;
      points.push([xAt(col, count), y]);
    }
  });

  points.push([xAt(col, count), BOTTOM]);
  return { points, result: col };
}

function pointsAttr(points: number[][]) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function makeGame(players: string[], prizes: string[]): LadderGame {
  const count = players.length;
  const rungs = generateRungs(count);
  const traced = players.map((_, index) => traceRoute(index, count, rungs));

  return {
    players,
    prizes,
    rungs,
    routes: traced.map(route => route.points),
    results: traced.map(route => route.result),
  };
}

export default function LadderClient() {
  const [count, setCount] = useState(2);
  const [players, setPlayers] = useState(() => makeInitialItems(DEFAULT_PLAYERS, 2));
  const [prizes, setPrizes] = useState(() => makeInitialItems(DEFAULT_PRIZES, 2));
  const [stage, setStage] = useState<Stage>("setup");
  const [game, setGame] = useState<LadderGame | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>([]);

  const canStart = useMemo(() => (
    players.every(item => item.trim()) && prizes.every(item => item.trim())
  ), [players, prizes]);

  function changeCount(nextCount: number) {
    const safeCount = clampCount(nextCount);
    setCount(safeCount);
    setPlayers(prev => Array.from({ length: safeCount }, (_, i) => prev[i] || DEFAULT_PLAYERS[i] || `${i + 1}`));
    setPrizes(prev => Array.from({ length: safeCount }, (_, i) => prev[i] || DEFAULT_PRIZES[i] || `${i + 1}`));
    resetGame();
  }

  function updatePlayer(index: number, value: string) {
    setPlayers(prev => prev.map((item, i) => (i === index ? value : item)));
  }

  function updatePrize(index: number, value: string) {
    setPrizes(prev => prev.map((item, i) => (i === index ? value : item)));
  }

  function resetGame() {
    setStage("setup");
    setGame(null);
    setActiveIndex(null);
    setRevealed([]);
  }

  function startGame() {
    if (!canStart) return;
    const nextGame = makeGame(players.map(p => p.trim()), prizes.map(p => p.trim()));
    setGame(nextGame);
    setRevealed(Array.from({ length: count }, () => false));
    setActiveIndex(0);
    setStage("playing");
  }

  useEffect(() => {
    if (stage !== "playing" || activeIndex === null || !game) return;

    const revealTimer = window.setTimeout(() => {
      setRevealed(prev => prev.map((item, i) => (i === activeIndex ? true : item)));
    }, 760);

    const nextTimer = window.setTimeout(() => {
      if (activeIndex >= game.players.length - 1) {
        setActiveIndex(null);
        setStage("done");
      } else {
        setActiveIndex(activeIndex + 1);
      }
    }, 1180);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(nextTimer);
    };
  }, [activeIndex, game, stage]);

  return (
    <div className="ladder-page">
      <div className="page-header">
        <h1>사다리</h1>
      </div>

      <div className="ladder-layout">
        <section className="panel ladder-setup">
          <h2>저녁 메뉴 사다리타기</h2>
          <p className="hint-text">참여 인원과 아래 당첨 후보를 입력한 뒤 시작하면 자동으로 사다리를 탑니다.</p>

          <div className="ladder-counts" aria-label="참여 인원">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map(value => (
              <button
                type="button"
                key={value}
                className={`ladder-count-btn${count === value ? " active" : ""}`}
                onClick={() => changeCount(value)}
              >
                {value}명
              </button>
            ))}
          </div>

          <div className="ladder-input-block">
            <div className="ladder-input-head">
              <span>위</span>
              <strong>참여자</strong>
            </div>
            <div className="ladder-input-grid">
              {players.map((player, index) => (
                <input
                  key={`player-${index}`}
                  value={player}
                  onChange={e => updatePlayer(index, e.target.value)}
                  placeholder={`참여자 ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="ladder-input-block">
            <div className="ladder-input-head">
              <span>밑</span>
              <strong>당첨</strong>
            </div>
            <div className="ladder-input-grid">
              {prizes.map((prize, index) => (
                <input
                  key={`prize-${index}`}
                  value={prize}
                  onChange={e => updatePrize(index, e.target.value)}
                  placeholder={`당첨 ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="ladder-actions">
            <button type="button" className="solid-button" onClick={startGame} disabled={!canStart || stage === "playing"}>
              {stage === "playing" ? "진행 중" : "Start"}
            </button>
            <button type="button" className="ghost-button" onClick={resetGame}>초기화</button>
          </div>
        </section>

        <section className="panel ladder-board-panel">
          <div className="ladder-board-head">
            <h2>결과</h2>
            {stage === "done" && <span className="badge badge-income">완료</span>}
          </div>

          {!game ? (
            <div className="ladder-empty">
              <div className="ladder-empty-icon">🪜</div>
              <p>인원을 고르고 Start를 누르면 사다리가 바로 시작됩니다.</p>
            </div>
          ) : (
            <>
              <div className="ladder-canvas-wrap">
                <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="ladder-svg" role="img" aria-label="사다리 결과">
                  {game.players.map((player, index) => (
                    <g key={`col-${index}`}>
                      <line className="ladder-vertical" x1={xAt(index, count)} x2={xAt(index, count)} y1={TOP} y2={BOTTOM} />
                      <text className="ladder-svg-label" x={xAt(index, count)} y={32} textAnchor="middle">{player}</text>
                      <text className="ladder-svg-prize" x={xAt(index, count)} y={482} textAnchor="middle">
                        {game.prizes[index]}
                      </text>
                    </g>
                  ))}

                  {game.rungs.map((rowRungs, row) => rowRungs.map(col => (
                    <line
                      key={`rung-${row}-${col}`}
                      className="ladder-rung"
                      x1={xAt(col, count)}
                      x2={xAt(col + 1, count)}
                      y1={yAt(row, game.rungs.length)}
                      y2={yAt(row, game.rungs.length)}
                    />
                  )))}

                  {activeIndex !== null && (
                    <polyline
                      key={`active-${activeIndex}`}
                      className="ladder-route active"
                      points={pointsAttr(game.routes[activeIndex])}
                      pathLength={1}
                      style={{ stroke: COLORS[activeIndex % COLORS.length] }}
                    />
                  )}

                  {game.routes.map((route, index) => revealed[index] && activeIndex !== index ? (
                    <polyline
                      key={`route-${index}`}
                      className="ladder-route revealed"
                      points={pointsAttr(route)}
                      pathLength={1}
                      style={{ stroke: COLORS[index % COLORS.length] }}
                    />
                  ) : null)}
                </svg>
              </div>

              <div className="ladder-results">
                {game.players.map((player, index) => {
                  const resultIndex = game.results[index];
                  return (
                    <div key={`result-${player}-${index}`} className={`ladder-result${revealed[index] ? " revealed" : ""}`}>
                      <span className="ladder-result-player" style={{ color: COLORS[index % COLORS.length] }}>{player}</span>
                      <span className="ladder-result-arrow">→</span>
                      <strong>{revealed[index] ? game.prizes[resultIndex] : "?"}</strong>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
