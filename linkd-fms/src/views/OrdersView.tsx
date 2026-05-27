import { ShoppingCart } from "lucide-react";

/**
 * OrdersView — placeholder for the future Orders surface.
 *
 * Wired into the sidebar (Manage → Orders) for admin + design_coordinator.
 * The page is intentionally empty until the Orders data model and workflow
 * are defined — keeping a real URL slot reserved lets the menu entry ship
 * without 404-ing.
 */
export function OrdersView() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Orders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Production orders, pulled from the sampling pipeline.
        </p>
      </div>

      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-4 py-12">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            Orders module coming soon
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            This is the new home for production orders. The data model and
            workflow are being finalized — for now, manage orders from the
            Sampling queue (the "Order" type in Order / Sample column).
          </p>
        </div>
      </div>
    </div>
  );
}
