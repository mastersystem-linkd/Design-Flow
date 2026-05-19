import { useState } from "react";
import { Loader2, AlertTriangle, AlertOctagon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "default" | "danger" | "warning";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Optional label of the item being affected — shown in monospace under the description. */
  itemRef?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const VARIANT: Record<
  ConfirmVariant,
  {
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconColor: string;
    buttonClass: string;
  }
> = {
  default: {
    icon: AlertTriangle,
    iconBg: "bg-secondary",
    iconColor: "text-foreground",
    buttonClass: "",
  },
  danger: {
    icon: AlertOctagon,
    iconBg: "bg-destructive/15",
    iconColor: "text-destructive",
    buttonClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-warning/30",
    iconColor: "text-foreground",
    buttonClass: "bg-warning text-foreground hover:bg-warning/90",
  },
};

/**
 * Modal confirmation. Radix Dialog handles Esc, click-outside, and focus trap
 * automatically. Set `variant="danger"` for destructive actions (red Confirm),
 * `"warning"` for caution-but-not-destructive (gold Confirm).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  itemRef,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const v = VARIANT[variant];
  const Icon = v.icon;

  async function handleConfirm() {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return; // ignore Esc/outside-click while in-flight
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                v.iconBg
              )}
            >
              <Icon className={cn("h-5 w-5", v.iconColor)} />
            </div>
            <div className="space-y-1">
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        {itemRef && (
          <div className="border-y border-border bg-secondary/40 px-6 py-3">
            <span className="font-mono text-sm text-foreground">{itemRef}</span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy}
            className={cn("gap-2", v.buttonClass)}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
