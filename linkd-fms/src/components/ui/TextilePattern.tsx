/**
 * Subtle textile/weave pattern used as a decorative background on the login
 * hero panel. Renders as an inline SVG with a tiling pattern so it scales
 * cleanly at any size.
 *
 *   <TextilePattern className="absolute inset-0 h-full w-full" />
 */
export function TextilePattern({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        {/* Herringbone weave — two interlocking V-shapes */}
        <pattern
          id="herringbone"
          patternUnits="userSpaceOnUse"
          width="28"
          height="28"
          patternTransform="rotate(0)"
        >
          <path
            d="M0 0 L14 14 L0 28"
            fill="none"
            stroke="#E8C97E"
            strokeWidth="0.4"
            opacity="0.18"
          />
          <path
            d="M14 0 L28 14 L14 28"
            fill="none"
            stroke="#E8C97E"
            strokeWidth="0.4"
            opacity="0.18"
          />
          <circle cx="14" cy="14" r="0.6" fill="#E8C97E" opacity="0.35" />
        </pattern>

        {/* Soft radial vignette so the pattern fades toward the edges */}
        <radialGradient id="vignette" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#1A1714" stopOpacity="0" />
          <stop offset="80%" stopColor="#1A1714" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#1A1714" stopOpacity="0.95" />
        </radialGradient>
      </defs>

      <rect width="100%" height="100%" fill="url(#herringbone)" />
      <rect width="100%" height="100%" fill="url(#vignette)" />
    </svg>
  );
}
