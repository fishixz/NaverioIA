import { useEffect, useState } from 'react';
import World from './World.jsx';

function LoadingScreen({ progress, opening }) {
  return (
    <div className={`loading-screen ${opening ? 'is-leaving' : ''}`} role="status" aria-label="Preparando o mundo de Navério">
      <div className="loading-mark" aria-hidden="true">
        <span className="loading-orbit loading-orbit-one" />
        <span className="loading-orbit loading-orbit-two" />
        <span className="loading-core" />
      </div>
      <div className="loading-wordmark">navério</div>
      <div className="loading-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="loading-percent">{progress}%</div>
    </div>
  );
}

export default function App() {
  const [progress, setProgress] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now) => {
      const elapsed = now - startedAt;
      setProgress(Math.min(100, Math.round((elapsed / 2050) * 100)));
      if (elapsed < 2050) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (progress < 100 || !sceneReady) return undefined;
    const timeout = window.setTimeout(() => setOpened(true), 380);
    return () => window.clearTimeout(timeout);
  }, [progress, sceneReady]);

  return (
    <div className="experience">
      <main className={`world-stage ${opened ? 'is-open' : ''}`}>
        <World onReady={() => setSceneReady(true)} />
      </main>

      <div className={`opening-curtain ${opened ? 'is-open' : ''}`} aria-hidden="true">
        <div className="curtain-panel curtain-panel-top" />
        <div className="curtain-panel curtain-panel-bottom" />
        <div className="curtain-glow" />
      </div>

      {!opened && <LoadingScreen progress={progress} opening={progress === 100 && sceneReady} />}
    </div>
  );
}
