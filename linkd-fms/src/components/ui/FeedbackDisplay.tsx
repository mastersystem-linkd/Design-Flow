import { cn } from "@/lib/utils";

const AUDIO_PATTERN = /🎙\s*Voice feedback:\s*(.+?)$/m;

export function FeedbackDisplay({ text, className }: { text: string; className?: string }) {
  const textOnly = text.replace(AUDIO_PATTERN, "").trim();

  if (!textOnly) return null;

  return (
    <p className={cn("text-xs leading-relaxed text-foreground whitespace-pre-wrap", className)}>
      {textOnly}
    </p>
  );
}
