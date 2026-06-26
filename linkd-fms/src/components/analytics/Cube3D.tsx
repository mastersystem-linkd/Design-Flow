// Cube3D — a small always-on rotating 3D cube (pure CSS 3D, no three.js) used
// as an elegant high-tech accent in dashboard headers. Continuously rotates;
// freezes at a fixed angle under prefers-reduced-motion. Scoped <style> keeps
// it self-contained (24px to sit inside a header icon chip).
export function Cube3D() {
  return (
    <div className="df3-scene" aria-hidden>
      <style>{`
        .df3-scene { width: 24px; height: 24px; perspective: 120px; }
        .df3-cube {
          position: relative; width: 24px; height: 24px;
          transform-style: preserve-3d;
          animation: df3-spin 9s linear infinite;
          will-change: transform;
        }
        .df3-face {
          position: absolute; inset: 0; border-radius: 4px;
          border: 1px solid rgb(var(--primary) / 0.55);
          background: linear-gradient(135deg, rgb(var(--primary) / 0.18), rgb(var(--primary) / 0.04));
          box-shadow: inset 0 0 6px rgb(var(--primary) / 0.18);
        }
        .df3-front  { transform: translateZ(12px); }
        .df3-back   { transform: rotateY(180deg) translateZ(12px); }
        .df3-right  { transform: rotateY(90deg)  translateZ(12px); }
        .df3-left   { transform: rotateY(-90deg) translateZ(12px); }
        .df3-top    { transform: rotateX(90deg)  translateZ(12px); }
        .df3-bottom { transform: rotateX(-90deg) translateZ(12px); }
        @keyframes df3-spin {
          from { transform: rotateX(-22deg) rotateY(0deg); }
          to   { transform: rotateX(-22deg) rotateY(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .df3-cube { animation: none; transform: rotateX(-22deg) rotateY(-32deg); }
        }
      `}</style>
      <div className="df3-cube">
        <span className="df3-face df3-front" />
        <span className="df3-face df3-back" />
        <span className="df3-face df3-right" />
        <span className="df3-face df3-left" />
        <span className="df3-face df3-top" />
        <span className="df3-face df3-bottom" />
      </div>
    </div>
  );
}
