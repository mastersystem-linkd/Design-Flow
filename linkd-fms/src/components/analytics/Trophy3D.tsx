const COLORS = {
  1: {
    front: "#f59e0b", side: "#92400e", rim: "#fcd34d",
    star: "#fffbeb", shadow: "rgba(245,158,11,0.50)",
    outline: "#78350f", label: "1st",
  },
  2: {
    front: "#7c8da6", side: "#3b4f6b", rim: "#b8c8dc",
    star: "#e8edf3", shadow: "rgba(124,141,166,0.45)",
    outline: "#2c3e56", label: "2nd",
  },
  3: {
    front: "#d97706", side: "#7c2d12", rim: "#fbbf24",
    star: "#fff7ed", shadow: "rgba(217,119,6,0.45)",
    outline: "#6c2710", label: "3rd",
  },
} as const;

export function Trophy3D({ rank, size = 32 }: { rank: 1 | 2 | 3; size?: number }) {
  const c = COLORS[rank];
  const S = size;
  const cup  = S * 0.52;
  const cupH = S * 0.48;
  const stem = S * 0.08;
  const stemH = S * 0.14;
  const baseW = S * 0.56;
  const baseH = S * 0.10;
  const handleW = S * 0.14;

  return (
    <div
      className="trophy3d"
      style={{ width: S, height: S }}
      aria-label={`${c.label} place trophy`}
      role="img"
    >
      <style>{`
        .trophy3d {
          perspective: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .trophy3d-body {
          transform-style: preserve-3d;
          animation: t3d-rock 3.2s ease-in-out infinite;
          will-change: transform;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .trophy3d:hover .trophy3d-body {
          animation: t3d-pop 0.5s cubic-bezier(.34,1.56,.64,1) 1,
                     t3d-rock 3.2s ease-in-out 0.5s infinite;
        }
        @keyframes t3d-rock {
          0%, 100% { transform: rotateY(0deg)   rotateX(2deg); }
          25%      { transform: rotateY(18deg)  rotateX(-2deg); }
          75%      { transform: rotateY(-18deg) rotateX(-2deg); }
        }
        @keyframes t3d-pop {
          0%   { transform: scale(1)   rotateY(0); }
          30%  { transform: scale(1.2) rotateY(-20deg); }
          60%  { transform: scale(1.2) rotateY(20deg); }
          100% { transform: scale(1)   rotateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .trophy3d-body {
            animation: none !important;
            transform: rotateY(-8deg) rotateX(2deg) !important;
          }
        }
      `}</style>

      <div className="trophy3d-body">
        {/* Cup */}
        <div style={{
          width: cup,
          height: cupH,
          background: `linear-gradient(135deg, ${c.rim} 0%, ${c.front} 40%, ${c.side} 100%)`,
          borderRadius: `${S * 0.06}px ${S * 0.06}px ${S * 0.30}px ${S * 0.30}px`,
          border: `1px solid ${c.outline}`,
          boxShadow: `
            inset ${S * 0.04}px ${S * 0.04}px ${S * 0.10}px rgba(255,255,255,0.55),
            inset -${S * 0.03}px -${S * 0.03}px ${S * 0.08}px rgba(0,0,0,0.20),
            0 ${S * 0.04}px ${S * 0.16}px ${c.shadow}
          `,
          position: "relative",
          transformStyle: "preserve-3d",
          transform: "translateZ(2px)",
        }}>
          {/* Shine strip */}
          <div style={{
            position: "absolute",
            top: S * 0.04,
            left: S * 0.06,
            width: S * 0.06,
            height: cupH * 0.65,
            borderRadius: 999,
            background: "linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 100%)",
          }} />

          {/* Star emblem */}
          <svg
            viewBox="0 0 24 24"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) translateZ(3px)",
              width: S * 0.30,
              height: S * 0.30,
            }}
          >
            <path
              d="M12 2 l2.4 5 5.4 0.8 -3.9 3.8 0.9 5.4 -4.8-2.5 -4.8 2.5 0.9-5.4 -3.9-3.8 5.4-0.8z"
              fill={c.star}
              opacity={0.7}
            />
          </svg>

          {/* Left handle */}
          <div style={{
            position: "absolute",
            top: S * 0.02,
            left: -handleW + S * 0.01,
            width: handleW,
            height: cupH * 0.60,
            border: `${S * 0.04}px solid ${c.front}`,
            borderLeft: `${S * 0.04}px solid ${c.side}`,
            borderRadius: `${S * 0.12}px 0 0 ${S * 0.12}px`,
            borderRight: "none",
            boxShadow: `inset 1px 1px 2px rgba(255,255,255,0.35), -1px 1px 3px ${c.shadow}`,
          }} />

          {/* Right handle */}
          <div style={{
            position: "absolute",
            top: S * 0.02,
            right: -handleW + S * 0.01,
            width: handleW,
            height: cupH * 0.60,
            border: `${S * 0.04}px solid ${c.front}`,
            borderRight: `${S * 0.04}px solid ${c.rim}`,
            borderRadius: `0 ${S * 0.12}px ${S * 0.12}px 0`,
            borderLeft: "none",
            boxShadow: `inset -1px 1px 2px rgba(255,255,255,0.35), 1px 1px 3px ${c.shadow}`,
          }} />
        </div>

        {/* Stem */}
        <div style={{
          width: stem,
          height: stemH,
          background: `linear-gradient(90deg, ${c.side}, ${c.front}, ${c.rim})`,
          borderLeft: `1px solid ${c.outline}`,
          borderRight: `1px solid ${c.outline}`,
          transform: "translateZ(1px)",
        }} />

        {/* Base */}
        <div style={{
          width: baseW,
          height: baseH,
          background: `linear-gradient(135deg, ${c.rim} 0%, ${c.front} 40%, ${c.side} 100%)`,
          borderRadius: S * 0.04,
          border: `1px solid ${c.outline}`,
          boxShadow: `
            inset ${S * 0.02}px ${S * 0.01}px ${S * 0.04}px rgba(255,255,255,0.45),
            inset -${S * 0.02}px -${S * 0.01}px ${S * 0.04}px rgba(0,0,0,0.15),
            0 ${S * 0.02}px ${S * 0.06}px rgba(0,0,0,0.12)
          `,
          transform: "translateZ(1px)",
        }} />
      </div>
    </div>
  );
}
