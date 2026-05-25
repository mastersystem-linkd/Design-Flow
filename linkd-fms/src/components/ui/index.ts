// Barrel for every UI primitive. Import from `@/components/ui` rather than
// individual files, e.g.:
//
//   import { Button, Skeleton, toast, useToast, ConfirmDialog } from "@/components/ui";

// ----- Existing primitives -----
export { Avatar, AvatarImage, AvatarFallback, getInitials } from "./avatar";
export { Badge, badgeVariants } from "./badge";
export { Button, buttonVariants, type ButtonProps } from "./button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./card";
export { ConceptImage } from "./ConceptImage";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./dialog";
export { FloatingInput, type FloatingInputProps } from "./FloatingInput";
export { Input, type InputProps } from "./input";
export { Label } from "./label";
export { LoadingScreen } from "./LoadingScreen";
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./sheet";
export { TextilePattern } from "./TextilePattern";

// ----- App-shell skeleton (full-page loading state) -----
export { AppShellSkeleton } from "./AppShellSkeleton";

// ----- DeadlineCell (date + relative-days indicator for task tables) -----
export { DeadlineCell } from "./DeadlineCell";

// ----- ThemeToggle (light/dark/system cycle button) -----
export { ThemeToggle } from "./ThemeToggle";

// ----- NotificationBell (bell icon + dropdown for TopNav) -----
export { NotificationBell } from "./NotificationBell";

// ----- New UX utilities (this sprint) -----
export {
  Toaster,
  toast,
  useToast,
  type ToastType,
  type ToastOptions,
  type ToastItem,
} from "./Toaster";
export { Skeleton, SkeletonCard, SkeletonTable, SkeletonText } from "./Skeleton";
export {
  EmptyState,
  type EmptyStateProps,
  type EmptyStateAction,
} from "./EmptyState";
export {
  ConfirmDialog,
  type ConfirmDialogProps,
  type ConfirmVariant,
} from "./ConfirmDialog";
export { LoadingButton, type LoadingButtonProps } from "./LoadingButton";
export { ConnectionDot } from "./ConnectionDot";
export { SearchInput, type SearchInputProps } from "./SearchInput";
export { ExportDialog } from "./ExportDialog";
export { Pagination, type PaginationProps } from "./Pagination";
export { Sparkline } from "./Sparkline";
export { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
export { LazyImage, type LazyImageProps } from "./LazyImage";
export { TShirtLoader, LoaderProvider, useLoader } from "./TShirtLoader";
export { Combobox, type ComboboxOption, type ComboboxProps } from "./Combobox";
