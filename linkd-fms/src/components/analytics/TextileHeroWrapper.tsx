import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function TextileHeroWrapper({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        "rounded-2xl sm:rounded-3xl",
        "border border-white/5 dark:border-white/[0.07]",
        // Frosted glass surface — content floats over the aurora canvas.
        "glass-panel bg-gradient-to-br from-primary/[0.06] via-card/80 to-card/90",
        "shadow-glow-soft",
        "p-3 sm:p-4 md:p-5",
        className
      )}
    >
      {/* Aurora blobs — slow brand-tinted blooms for "living depth" */}
      <div
        aria-hidden
        className="aurora-blob aurora-blob-a -right-20 -top-20 h-48 w-48 bg-primary/25"
      />
      <div
        aria-hidden
        className="aurora-blob aurora-blob-b -bottom-24 left-1/4 h-56 w-56 bg-success/15"
      />
      <div
        aria-hidden
        className="aurora-blob aurora-blob-a -left-16 top-1/3 h-40 w-40 bg-warning/12"
      />
      {/* Woven dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgb(var(--foreground)) 0.75px, transparent 0.75px)",
          backgroundSize: "16px 16px",
        }}
      />
      {/* Warp-line accent — draws in on mount */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary/50 via-warning/30 to-success/40",
          entered ? "warp-draw" : "opacity-0"
        )}
      />
      {/* Bottom edge shimmer */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/10 to-transparent"
      />
      {/* Children stagger in after warp draws */}
      <div
        className={cn("relative", entered ? "weft-in" : "opacity-0")}
        style={entered ? { animationDelay: "200ms" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
