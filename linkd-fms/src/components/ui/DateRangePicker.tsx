import { useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

export function DateRangePicker({ from, to, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  function handleApply() {
    if (draftFrom && draftTo && draftFrom <= draftTo) {
      onChange(draftFrom, draftTo);
      setOpen(false);
    }
  }

  function formatLabel(d: string): string {
    try {
      const dt = new Date(d + "T00:00:00");
      return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } catch { return d; }
  }

  const year = to ? new Date(to + "T00:00:00").getFullYear() : new Date().getFullYear();

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => { setDraftFrom(from); setDraftTo(to); setOpen((p) => !p); }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary/50"
      >
        <Calendar className="h-3 w-3 text-muted-foreground" />
        {formatLabel(from)} – {formatLabel(to)}, {year}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</label>
                <input
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</label>
                <input
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>
              <button
                type="button"
                onClick={handleApply}
                disabled={!draftFrom || !draftTo || draftFrom > draftTo}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
