export function TrophySpin({ size = 24 }: { size?: number }) {
  const id = "tspin";
  return (
    <div className="tspin-scene" aria-hidden style={{ width: size, height: size }}>
      <style>{`
        .tspin-scene {
          perspective: 140px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .tspin-wrap {
          transform-style: preserve-3d;
          animation: tspin-rotate 7s linear infinite;
          will-change: transform;
        }
        @keyframes tspin-rotate {
          from { transform: rotateX(-18deg) rotateY(0deg); }
          to   { transform: rotateX(-18deg) rotateY(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tspin-wrap {
            animation: none;
            transform: rotateX(-18deg) rotateY(-30deg);
          }
        }
      `}</style>
      <div className="tspin-wrap" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 48 48"
          width={size}
          height={size}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="40%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id={`${id}-stem`} x1="0.5" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#92400e" />
            </linearGradient>
            <linearGradient id={`${id}-hi`} x1="0.3" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.7" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <filter id={`${id}-g`}>
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#92400e" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Cup */}
          <path
            d="M14 8 h20 v3 c0 9 -4 15 -10 17 c-6 -2 -10 -8 -10 -17 z"
            fill={`url(#${id}-body)`}
            stroke="#92400e"
            strokeWidth="0.8"
            filter={`url(#${id}-g)`}
          />

          {/* Left handle */}
          <path
            d="M14 11 C7 11 6 17 10 21 L14 18"
            stroke="#b45309"
            strokeWidth="2.8"
            strokeLinecap="round"
            fill="none"
          />

          {/* Right handle */}
          <path
            d="M34 11 C41 11 42 17 38 21 L34 18"
            stroke="#b45309"
            strokeWidth="2.8"
            strokeLinecap="round"
            fill="none"
          />

          {/* Highlight */}
          <path
            d="M17 10 h5 v3 c0 6 -1 10 -4 13 c-2 -3 -2 -7 -1 -13 z"
            fill={`url(#${id}-hi)`}
            opacity="0.9"
          />

          {/* Stem */}
          <rect x="21" y="28" width="6" height="6" rx="1.5" fill={`url(#${id}-stem)`} stroke="#92400e" strokeWidth="0.5" />

          {/* Base */}
          <rect x="15" y="34" width="18" height="4" rx="2" fill={`url(#${id}-body)`} stroke="#92400e" strokeWidth="0.5" />
          <rect x="18" y="34.8" width="12" height="1.4" rx="0.7" fill="white" opacity="0.35" />

          {/* Star */}
          <path
            d="M24 12 l1.6 3.2 3.5 0.5 -2.5 2.5 0.6 3.5 -3.2-1.7 -3.2 1.7 0.6-3.5 -2.5-2.5 3.5-0.5z"
            fill="white"
            opacity="0.55"
          />
        </svg>
      </div>
    </div>
  );
}
