import { SkeletonCard } from "@/components/ui/Skeleton";

/**
 * Full-app loading state used while `useAuth` is resolving the session.
 *
 * Renders a pulsing version of the real shell — dark sidebar with brand
 * block + nav rows, top bar with title/search/user, content area with
 * card placeholders. Looks like the app is mid-load, not a generic spinner.
 */
export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <SkeletonSidebar />
      <div className="md:pl-[220px]">
        <SkeletonTopNav />
        <main className="px-4 pb-10 pt-20 sm:px-6 md:px-8">
          <SkeletonContent />
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// Sidebar — full-height dark column with brand, nav rows, user block
// ============================================================================

function SkeletonSidebar() {
  return (
    <aside
      className="hidden md:fixed md:left-0 md:top-0 md:z-40 md:flex md:h-screen md:w-[220px] md:flex-col md:bg-sidebar"
      aria-hidden
    >
      {/* Brand block */}
      <div className="flex items-center gap-2.5 border-b border-cream/10 px-5 py-4">
        <div className="h-9 w-9 animate-pulse rounded-md bg-primary/40" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3 w-16 animate-pulse rounded bg-card/15" />
          <div className="h-2 w-20 animate-pulse rounded bg-card/10" />
        </div>
      </div>

      {/* Nav rows */}
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <NavRowSkeleton key={`g1-${i}`} />
          ))}
        </ul>
        <div className="my-3 h-px bg-card/10" />
        <ul className="space-y-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <NavRowSkeleton key={`g2-${i}`} />
          ))}
        </ul>
      </nav>

      {/* User block */}
      <div className="flex items-center gap-3 border-t border-cream/10 px-4 py-3.5">
        <div className="h-9 w-9 animate-pulse rounded-full bg-card/15" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3 w-24 animate-pulse rounded bg-card/15" />
          <div className="h-2 w-12 animate-pulse rounded bg-card/10" />
        </div>
      </div>
    </aside>
  );
}

function NavRowSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-md px-3 py-2">
      <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-card/15" />
      <div className="h-3 flex-1 animate-pulse rounded bg-card/10" />
    </li>
  );
}

// ============================================================================
// TopNav — bar with title, search, user
// ============================================================================

function SkeletonTopNav() {
  return (
    <header
      className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:left-[220px] md:px-6"
      aria-hidden
    >
      {/* Page title */}
      <div className="h-5 w-32 animate-pulse rounded bg-secondary" />

      {/* Search */}
      <div className="ml-auto hidden h-9 max-w-md flex-1 animate-pulse rounded-md bg-secondary sm:block" />

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-3 sm:ml-3">
        <div className="hidden h-2 w-2 animate-pulse rounded-full bg-secondary sm:block" />
        <div className="hidden h-4 w-16 animate-pulse rounded bg-secondary sm:block" />
        <div className="h-7 w-7 animate-pulse rounded-full bg-secondary" />
      </div>
    </header>
  );
}

// ============================================================================
// Content — small grid of card placeholders
// ============================================================================

function SkeletonContent() {
  return (
    <div className="space-y-5">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-9 w-48 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-72 animate-pulse rounded bg-secondary" />
      </div>

      {/* Card grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
