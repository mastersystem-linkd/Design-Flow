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
        "rounded-xl sm:rounded-2xl",
        "border border-border/50",
        "bg-gradient-to-br from-primary/[0.03] via-card to-card",
        "shadow-sm",
        "p-2.5 sm:p-3 md:p-4",
        className
      )}
    >
      {/* Command-center corner glow — soft brand bloom for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/15 blur-3xl"
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
