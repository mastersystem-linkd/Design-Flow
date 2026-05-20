import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Shortcut } from "@/hooks/useKeyboardShortcuts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: Shortcut[];
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
}: Props) {
  // Group by category
  const groups = new Map<string, Shortcut[]>();
  for (const s of shortcuts) {
    const list = groups.get(s.category) ?? [];
    list.push(s);
    groups.set(s.category, list);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {Array.from(groups.entries()).map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </h3>
              <div className="space-y-1.5">
                {items.map((s) => (
                  <div
                    key={s.key + s.description}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-foreground">
                      {s.description}
                    </span>
                    <KeyBadge keyName={s.key} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KeyBadge({ keyName }: { keyName: string }) {
  const label = KEY_LABELS[keyName] ?? keyName.toUpperCase();
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-secondary px-2 font-mono text-[11px] font-medium text-foreground shadow-sm">
      {label}
    </kbd>
  );
}

const KEY_LABELS: Record<string, string> = {
  Enter: "Enter",
  Escape: "Esc",
  "/": "/",
  "?": "?",
  j: "J",
  k: "K",
  f: "F",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
};
