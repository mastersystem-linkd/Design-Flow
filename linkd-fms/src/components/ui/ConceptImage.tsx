import { useEffect, useState } from "react";
import { Download, ImageOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Concept files live in private Supabase Storage buckets. We store the storage
 * path in `concepts.image_url` / `concepts.file_url`. This component resolves
 * a 1-hour signed URL and renders a preview (images) or a download link
 * (non-image files like PSD, MP4).
 *
 * Tries `sample-files` first (new uploads since 0012), then `design-files`
 * (legacy). If `src` is already an http(s) URL it's used as-is.
 */

const BUCKETS = ["sample-files", "design-files"] as const;

async function resolveSignedUrl(
  path: string
): Promise<string | null> {
  // Already a full URL — use directly
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // Try each bucket in order until one succeeds
  for (const bucket of BUCKETS) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60); // 1 hour
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  }
  return null;
}

function isImagePath(path: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg)$/i.test(path);
}

export function ConceptImage({
  src,
  alt,
  className,
  showDownload = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Show a download button overlay. */
  showDownload?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUrl(null);
    setErrored(false);
    setLoading(true);

    if (!src) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    resolveSignedUrl(src).then((signed) => {
      if (cancelled) return;
      if (!signed) {
        setErrored(true);
      } else {
        setUrl(signed);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  // ── Empty / Error state ──
  if (!src || errored) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-secondary text-muted-foreground",
          className
        )}
      >
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }

  // ── Loading ──
  if (loading || !url) {
    return <div className={cn("animate-pulse bg-secondary", className)} />;
  }

  const isImg = isImagePath(src);

  // ── Non-image file (PSD, MP4, etc.) — show download link ──
  if (!isImg) {
    const fileName = src.split("/").pop() ?? "file";
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 bg-secondary text-muted-foreground",
          className
        )}
      >
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download={fileName}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="h-4 w-4" />
          Download {fileName.length > 25 ? fileName.slice(0, 22) + "…" : fileName}
        </a>
        <p className="text-[10px]">File preview not available</p>
      </div>
    );
  }

  // ── Image preview ──
  return (
    <div className={cn("relative group", className)}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="block h-full w-full"
      >
        <img
          src={url}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      </a>

      {/* Download overlay — visible on hover or always if showDownload */}
      <a
        href={url}
        download
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur transition-opacity hover:bg-black/90",
          showDownload
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        )}
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  );
}
