"use client";

import { useRef, useState } from "react";

export default function PlinkoClient() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  const reloadGame = () => {
    setLoaded(false);
    if (frameRef.current) {
      frameRef.current.src = "/marble-roulette/index.html";
    }
  };

  return (
    <div className="marble-page">
      <div className="page-header marble-header">
        <div>
          <h1>공굴리기</h1>
          <p>이름을 쉼표나 줄바꿈으로 넣고 시작하면 먼저 떨어지는 순서대로 결과가 정해집니다.</p>
        </div>
        <button type="button" className="ghost-button" onClick={reloadGame}>
          새 게임
        </button>
      </div>

      <section className="marble-frame-shell">
        {!loaded && <div className="marble-loading">게임을 불러오는 중...</div>}
        <iframe
          ref={frameRef}
          title="Marble Roulette"
          src="/marble-roulette/index.html"
          className="marble-frame"
          onLoad={() => setLoaded(true)}
          allow="clipboard-write"
        />
      </section>

      <p className="marble-credit">
        Marble Roulette by lazygyu, MIT License 기반으로 앱 안에 맞게 정적 빌드했습니다.
      </p>
    </div>
  );
}
