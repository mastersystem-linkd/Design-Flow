import { cn } from "@/lib/utils";

const RANK_CONFIG: Record<number, { cup: string; base: string; glow: string; label: string }> = {
  1: {
    cup: "from-amber-300 via-yellow-400 to-amber-500",
    base: "from-amber-400 to-yellow-500",
    glow: "shadow-[0_0_14px_rgb(251_191_36/0.50)]",
    label: "1st",
  },
  2: {
    cup: "from-slate-300 via-gray-200 to-slate-400",
    base: "from-slate-300 to-gray-400",
    glow: "shadow-[0_0_10px_rgb(148_163_184/0.35)]",
    label: "2nd",
  },
  3: {
    cup: "from-orange-400 via-amber-600 to-orange-700",
    base: "from-orange-500 to-amber-700",
    glow: "shadow-[0_0_10px_rgb(234_88_12/0.30)]",
    label: "3rd",
  },
};

export function Trophy3D({ rank, size = 28 }: { rank: 1 | 2 | 3; size?: number }) {
  const c = RANK_CONFIG[rank];
  const id = `t3d-${rank}`;

  return (
    <div
      className={cn("trophy-3d group/trophy relative", c.glow)}
      style={{ width: size, height: size }}
      aria-label={`${c.label} place trophy`}
      role="img"
    >
      <style>{`
        .trophy-3d {
          perspective: 200px;
          border-radius: 50%;
        }
        .trophy-inner {
          transform-style: preserve-3d;
          animation: trophy-idle 3s ease-in-out infinite;
          will-change: transform;
        }
        .trophy-3d:hover .trophy-inner,
        .trophy-3d:focus-within .trophy-inner {
          animation: trophy-celebrate 0.6s cubic-bezier(.36,1.2,.5,1) 1, trophy-idle 3s ease-in-out 0.6s infinite;
        }
        @keyframes trophy-idle {
          0%, 100% { transform: rotateY(0deg) rotateX(0deg); }
          25%      { transform: rotateY(8deg) rotateX(-3deg); }
          50%      { transform: rotateY(0deg) rotateX(0deg); }
          75%      { transform: rotateY(-8deg) rotateX(3deg); }
        }
        @keyframes trophy-celebrate {
          0%   { transform: rotateY(0) scale(1); }
          25%  { transform: rotateY(-15deg) scale(1.12); }
          50%  { transform: rotateY(15deg) scale(1.12); }
          75%  { transform: rotateY(-8deg) scale(1.06); }
          100% { transform: rotateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .trophy-inner {
            animation: none !important;
            transform: rotateY(-6deg) !important;
          }
        }
      `}</style>

      <div className="trophy-inner flex h-full w-full items-center justify-center">
        <svg
          viewBox="0 0 40 40"
          width={size}
          height={size}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={`${id}-cup`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" className={`[stop-color:theme(colors.amber.300)]`}
                style={{ stopColor: rank === 1 ? '#fcd34d' : rank === 2 ? '#cbd5e1' : '#fb923c' }} />
              <stop offset="50%" className="[stop-color:theme(colors.yellow.400)]"
                style={{ stopColor: rank === 1 ? '#facc15' : rank === 2 ? '#e2e8f0' : '#d97706' }} />
              <stop offset="100%"
                style={{ stopColor: rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : '#c2410c' }} />
            </linearGradient>
            <linearGradient id={`${id}-base`} x1="0.5" y1="0" x2="0.5" y2="1">
              <stop offset="0%"
                style={{ stopColor: rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : '#ea580c' }} />
              <stop offset="100%"
                style={{ stopColor: rank === 1 ? '#b45309' : rank === 2 ? '#64748b' : '#9a3412' }} />
            </linearGradient>
            <linearGradient id={`${id}-shine`} x1="0.3" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.55" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <filter id={`${id}-glow`}>
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Cup body */}
          <path
            d="M12 8 h16 v2 c0 8 -3 13 -8 15 c-5 -2 -8 -7 -8 -15 z"
            fill={`url(#${id}-cup)`}
            filter={`url(#${id}-glow)`}
          />

          {/* Left handle */}
          <path
            d="M12 10 C6 10 5 15 9 18 L12 16"
            stroke={`url(#${id}-cup)`}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />

          {/* Right handle */}
          <path
            d="M28 10 C34 10 35 15 31 18 L28 16"
            stroke={`url(#${id}-cup)`}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />

          {/* Shine highlight */}
          <path
            d="M15 10 h4 v2 c0 6 -1 9 -3 11 c-2 -2 -2 -5 -1 -11 z"
            fill={`url(#${id}-shine)`}
            opacity="0.7"
          />

          {/* Stem */}
          <rect x="18" y="25" width="4" height="5" rx="1" fill={`url(#${id}-base)`} />

          {/* Base plate */}
          <rect x="13" y="30" width="14" height="3" rx="1.5" fill={`url(#${id}-base)`} />

          {/* Base shine */}
          <rect x="15" y="30.5" width="10" height="1" rx="0.5" fill="white" opacity="0.3" />

          {/* Star on cup */}
          <path
            d="M20 12 l1.2 2.4 2.6 0.4 -1.9 1.8 0.4 2.6 -2.3 -1.2 -2.3 1.2 0.4 -2.6 -1.9 -1.8 2.6 -0.4z"
            fill="white"
            opacity="0.5"
          />
        </svg>
      </div>
    </div>
  );
}
