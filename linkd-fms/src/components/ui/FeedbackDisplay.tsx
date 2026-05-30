import { useEffect, useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const AUDIO_PATTERN = /🎙\s*Voice feedback:\s*(.+?)$/m;
const BUCKET = "sample-files";

export function FeedbackDisplay({ text, className }: { text: string; className?: string }) {
  const match = text.match(AUDIO_PATTERN);
  const audioPath = match?.[1]?.trim() ?? null;
  const textOnly = text.replace(AUDIO_PATTERN, "").trim();

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!audioPath) return;
    let cancelled = false;
    setLoading(true);
    void supabase.storage
      .from(BUCKET)
      .createSignedUrl(audioPath, 3600)
      .then(({ data }) => {
        if (!cancelled && data) setAudioUrl(data.signedUrl);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [audioPath]);

  return (
    <div className={cn("space-y-2", className)}>
      {textOnly ? (
        <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">{textOnly}</p>
      ) : audioPath ? (
        <p className="text-[11px] italic text-muted-foreground">Audio feedback — play the recording below</p>
      ) : null}
      {audioPath && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <Volume2 className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Voice Feedback</p>
            {loading ? (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading audio…
              </div>
            ) : audioUrl ? (
              <audio src={audioUrl} controls className="mt-1 h-8 w-full [&::-webkit-media-controls-panel]:bg-transparent" />
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">Audio unavailable</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
