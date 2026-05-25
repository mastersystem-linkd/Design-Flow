# LinkD FMS — AI Assistant Instructions

## Role & Mission
Act as an expert full-stack developer (React 18, TypeScript, Supabase, Tailwind CSS) working on the LinkD FMS workspace. Prioritize elegant, accessible, and performant solutions following the established conventions.

## 1. Project Context & Environment
- **Active Directory:** All active development happens strictly inside the `./linkd-fms/` directory. Ignore any legacy Next.js files at the root.
- **Tech Stack:** React 18, Vite 5, TypeScript (strict), React Router v6, Tailwind CSS 3.
- **Backend:** Supabase (PostgreSQL, Auth, Storage). 
- **Strict Dependency Pin:** The `@supabase/supabase-js` version is **strictly pinned to 2.45.4**. Do not update it, as newer versions cause request-hang bugs in this Vite environment.

## 2. Code Style & Architecture
- **Imports:** Always use the `@/` path alias for absolute imports (e.g., `import { Button } from "@/components/ui"`). Never use relative paths for deep imports.
- **UI Components:** Import all UI primitives from the barrel file `@/components/ui`. **Do not use the `shadcn-ui` CLI** to generate components; they are hand-written.
- **Theming:** The app uses a dual-theme (light/dark) system powered by CSS custom properties. Never hardcode Tailwind colors (like `bg-blue-500` or `text-gray-700`). Always use semantic variables (e.g., `bg-primary`, `bg-background`, `text-muted-foreground`, `border-border`).
- **File Naming:** Name all new component files using `PascalCase.tsx`. Hooks use `camelCase.ts`.
- **Icons & Charts:** Exclusively use `lucide-react` for icons and `recharts` for charting.

## 3. State Management & Data Fetching
- **React Query (v5):** Use `@tanstack/react-query` for all data fetching. **NEVER** use manual `useState`/`useEffect` for API calls.
- **Cache Keys:** Always use centralized cache keys imported from `lib/queryKeys.ts`.
- **Mutations:** Mutation hooks must return `Promise<{ data, error }>` and **never throw exceptions**. Errors should be formatted as strings ready to be passed to `toast.error()`.
- **Invalidation:** After successful mutations, always invalidate the relevant React Query cache using `queryClient.invalidateQueries`.

## 4. UI/UX Rules & Interactivity
- **Toasts:** Use the custom toast system via `import { toast } from "@/components/ui"`. Do not install or use `sonner` or `react-toastify`.
- **Confirmations:** Never use `window.confirm()`. Always use the custom `<ConfirmDialog>` component for destructive actions.
- **Loading States:** Prefer `<AppShellSkeleton>` for full-page loads, `<SkeletonCard>` / `<SkeletonTable>` for localized loading, and `<LoadingButton>` for async form submissions.
- **Forms:** For multi-field forms where data might be lost, wrap inputs using the `useFormDraft` hook for `localStorage` persistence.

## 5. Security & Permissions
- **Role Checks:** Never write inline role checks like `role === 'admin'`. Always import and use the helper functions from `lib/permissions.ts` (e.g., `isAdmin(role)`, `isAdminOrCoordinator(role)`).
- **Auth State:** Rely solely on the `useAuth()` hook for user session, profile, and role state.
- **Image Compression:** Before uploading any image to Supabase Storage, you **must** process it through `compressImage()` from `@/lib/imageCompression`.
- **Storage Paths:** All file upload paths to Supabase Storage must start with `{auth.uid()}/` to satisfy Row Level Security (RLS) policies.

## 6. Common Scripts (`/linkd-fms`)
- **Dev Server:** `npm run dev`
- **Type-Check / Lint:** `npm run type-check` (alias: `npm run lint`)
- **Build:** `npm run build`

## 7. Sampling Hub
- **Add Sample:** Do not use "Quick add form" for Add Sample. The sampling form must strictly be a pop-up form (center dialog) rather than a right-side drawer format.
