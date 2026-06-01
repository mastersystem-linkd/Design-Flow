import { SkeletonCard } from "@/components/ui/Skeleton";

export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <SkeletonSidebar />
      <div className="md:pl-[220px]">
        <SkeletonTopNav />
        <main className="px-4 pb-8 pt-[68px] sm:px-6 md:px-8">
          <SkeletonContent />
        </main>
      </div>
    </div>
  );
}

function SkeletonSidebar() {
  return (
    <aside
      className="hidden md:fixed md:left-0 md:top-0 md:z-40 md:flex md:h-screen md:w-[220px] md:flex-col md:border-r md:border-border md:bg-card dark:md:bg-sidebar"
      aria-hidden
    >
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <div className="h-9 w-9 animate-pulse rounded-xl bg-primary/10" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
          <div className="h-2 w-20 animate-pulse rounded bg-secondary/60" />
        </div>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <NavRowSkeleton key={`g1-${i}`} />
          ))}
        </ul>
        <div className="my-3 h-px bg-border" />
        <ul className="space-y-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <NavRowSkeleton key={`g2-${i}`} />
          ))}
        </ul>
      </nav>

      <div className="flex items-center gap-3 border-t border-border px-4 py-3.5">
        <div className="h-8 w-8 animate-pulse rounded-full bg-primary/10" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
          <div className="h-2 w-12 animate-pulse rounded bg-secondary/60" />
        </div>
      </div>
    </aside>
  );
}

function NavRowSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2">
      <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-secondary" />
      <div className="h-3 flex-1 animate-pulse rounded bg-secondary/60" />
    </li>
  );
}

function SkeletonTopNav() {
  return (
    <header
      className="topnav-glass fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border px-4 md:left-[220px] md:px-6"
      aria-hidden
    >
      <div className="flex flex-col gap-1">
        <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
        <div className="hidden h-2.5 w-40 animate-pulse rounded bg-secondary/60 sm:block" />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden h-2 w-2 animate-pulse rounded-full bg-secondary sm:block" />
        <div className="h-7 w-7 animate-pulse rounded-full bg-secondary" />
      </div>
    </header>
  );
}

function SkeletonContent() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-72 animate-pulse rounded bg-secondary/60" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
