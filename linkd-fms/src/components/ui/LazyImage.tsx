import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LazyImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "loading" | "src"> {
  src: string;
  alt: string;
  className?: string;
  /** Optional element shown when the image fails to load. */
  fallback?: React.ReactNode;
}

/**
 * LazyImage — defers fetching the image until it scrolls into the viewport
 * (IntersectionObserver, 100px rootMargin so it loads just before it appears).
 *
 *  - Pulses a Skeleton placeholder while waiting + while the image is decoding
 *  - Fades the image in (opacity 0 → 1, 300ms) once decoded
 *  - On error: renders the `fallback` if provided, otherwise a muted ImageOff icon
 *
 * NOT used for: avatars (too small to bother) or `ConceptImage` (it does its
 * own signed-URL loading flow).
 */
export function LazyImage({
  src,
  alt,
  className,
  fallback,
  ...imgProps
}: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // We only set the <img>'s src once the element scrolls near the viewport.
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Observe visibility. Stop observing as soon as we cross the threshold
  // — we only need to trigger the load once.
  useEffect(() => {
    if (shouldLoad) return;
    const el = containerRef.current;
    if (!el) return;

    // IntersectionObserver is widely supported; fall back to immediate load.
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin: "100px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden bg-secondary/40",
        className
      )}
    >
      {/* Placeholder pulse — visible until the real image has decoded. */}
      {!loaded && !errored && (
        <div className="absolute inset-0 animate-pulse bg-secondary/50" aria-hidden />
      )}

      {/* Error state — only when the image itself errored, not while waiting */}
      {errored && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/60">
          {fallback ?? <ImageOff className="h-6 w-6" />}
        </div>
      )}

      {/* The real <img> — only mounted once it's about to enter the viewport. */}
      {shouldLoad && !errored && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
          {...imgProps}
        />
      )}
    </div>
  );
}
