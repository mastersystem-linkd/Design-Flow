import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const CYCLE: Theme[] = ["light", "dark", "system"];

const ICON_MAP: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABEL_MAP: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  function cycle() {
    const idx = CYCLE.indexOf(theme);
    setTheme(CYCLE[(idx + 1) % CYCLE.length]);
  }

  const Icon = ICON_MAP[theme];

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        "text-muted-foreground hover:bg-secondary hover:text-foreground",
        className
      )}
      aria-label={`Theme: ${LABEL_MAP[theme]}. Click to change.`}
      title={`Current: ${LABEL_MAP[theme]}. Click to switch.`}
    >
      <Icon className="h-4 w-4" />
      <span>{LABEL_MAP[theme]}</span>
    </button>
  );
}
