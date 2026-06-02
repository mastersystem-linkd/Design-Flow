import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Mobile back-gesture handling
// ============================================================================
//
// Without this, opening a dialog doesn't add a history entry, so the
// browser's swipe-back gesture (and Android's hardware back button) pops
// the previous URL — taking the user back to /task-dashboard instead of
// just closing the form they were filling in.
//
// What we do instead:
//   1. When a dialog opens, push a marker entry onto history.pushState.
//      No URL change, just a stack frame we can detect later.
//   2. Register a `close()` callback on a module-level LIFO stack.
//   3. A single shared popstate listener (installed once) pops the top of
//      the stack and calls it — so the top-most open dialog closes,
//      and nested dialogs unwind one back gesture at a time.
//   4. When a dialog closes programmatically (X / Esc / outside click),
//      we check whether the current history state still carries our
//      marker; if so, we history.back() to remove it. That way the
//      forward URL stack stays clean and the NEXT back gesture takes
//      the user where they actually expect.
//
// Markers are unique per open (timestamp + random suffix) so the
// "is our marker still the current state?" check is race-free across
// rapidly opened/closed dialogs.
// ============================================================================

const dialogCloseStack: Array<() => void> = [];
let popstateListenerInstalled = false;

// When *we* call history.back() (programmatic close cleanup) the browser
// also fires popstate. Without coordination, the popstate listener would
// then pop the NEXT dialog off the stack — which is fatal for dialog →
// dialog transitions like Danger Zone's stage 1 → stage 2. By the time
// popstate fires after our history.back(), stage 2 has already mounted
// and pushed its handler, so popstate happily closes it immediately.
//
// `pendingProgrammaticPops` counts our own history.back() calls. The
// popstate listener decrements and ignores them; only "real" user back
// gestures get through to actually close a dialog.
let pendingProgrammaticPops = 0;

function installPopstateListener(): void {
  if (popstateListenerInstalled || typeof window === "undefined") return;
  popstateListenerInstalled = true;
  window.addEventListener("popstate", () => {
    if (pendingProgrammaticPops > 0) {
      pendingProgrammaticPops--;
      return;
    }
    const top = dialogCloseStack.pop();
    if (top) top();
  });
}

function useDialogBackButton(open: boolean, close: () => void): void {
  // Keep `close` fresh via ref so we don't tear down and re-push the
  // history marker on every parent re-render.
  const closeRef = React.useRef(close);
  closeRef.current = close;

  React.useEffect(() => {
    if (!open || typeof window === "undefined") return;

    installPopstateListener();

    const marker = `dlg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ dialogMarker: marker }, "");

    const handler = (): void => closeRef.current();
    dialogCloseStack.push(handler);

    return () => {
      const idx = dialogCloseStack.lastIndexOf(handler);
      if (idx >= 0) dialogCloseStack.splice(idx, 1);

      // Programmatic close (X / Esc / outside click): the marker is still
      // the top of history because no popstate fired. Pop it so future
      // back gestures don't first hit a phantom entry. The counter above
      // tells the popstate listener "we just triggered this — don't close
      // whatever's next on the stack."
      const state = window.history.state as { dialogMarker?: string } | null;
      if (state?.dialogMarker === marker) {
        pendingProgrammaticPops++;
        window.history.back();
      }
    };
  }, [open]);
}

// Wrap Radix's Root so every Dialog in the app gets the back-gesture
// handling for free. Both `open` and `onOpenChange` are passed through
// unchanged — only the close path additionally fires when the user
// swipes back / hits the hardware back button.
function Dialog({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  useDialogBackButton(!!open, () => onOpenChange?.(false));
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props} />
  );
}

const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-foreground/35 backdrop-blur-md",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** When the dialog UI doesn't carry a visible title (e.g. a detail
   *  drawer that uses a custom header), pass an `srTitle` so the
   *  accessibility tree still has one. Renders an `sr-only`
   *  `DialogTitle` that screen readers announce but sighted users
   *  never see. */
  srTitle?: string;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, srTitle, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      // Radix requires either a `<DialogDescription>` child OR an explicit
      // opt-out via `aria-describedby={undefined}`. Most dialogs have a
      // header but no description, so we default to the opt-out. Callers
      // can still pass their own `aria-describedby` to override.
      aria-describedby={undefined}
      className={cn(
        // `w-[calc(100%-2rem)]` keeps a 1rem gutter on phones so dialogs never
        // touch the screen edges; `max-w-lg` still caps width on desktop and
        // any caller's `max-w-*` / `w-[…vw]` overrides via tailwind-merge.
        "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-0 rounded-lg sm:rounded-2xl border border-border bg-card shadow-overlay dialog-panel dialog-ease",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95",
        className
      )}
      {...props}
    >
      {srTitle && (
        <DialogPrimitive.Title className="sr-only">
          {srTitle}
        </DialogPrimitive.Title>
      )}
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 opacity-60 transition-[opacity,background-color,transform] duration-normal ease-spring hover:opacity-100 hover:bg-secondary active:scale-90 focus:outline-none focus:ring-2 focus:ring-ring">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1.5 border-b border-border px-6 py-6 text-left",
      className
    )}
    {...props}
  />
);

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-sans text-2xl tracking-tight text-foreground", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
