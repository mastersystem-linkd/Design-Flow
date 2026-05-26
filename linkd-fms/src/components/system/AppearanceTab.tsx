import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun; desc: string }[] = [
  { value: "light", label: "Light", icon: Sun, desc: "Clean light interface" },
  { value: "dark", label: "Dark", icon: Moon, desc: "Easy on the eyes" },
  { value: "system", label: "System", icon: Monitor, desc: "Match your OS setting" },
];

export function AppearanceTab() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <div className="space-y-4">
      {/* Theme Selector */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-foreground">Theme</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Choose how Design Flow looks for you. Currently: {resolvedTheme}.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    "group flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-5 transition-all",
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                      active ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <p className={cn("text-[13px] font-semibold", active ? "text-primary" : "text-foreground")}>
                      {opt.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                  </div>
                  {active && (
                    <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Interface Density (read-only for now) */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-foreground">Interface</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Interface density and display preferences.
          </p>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
              <div>
                <p className="text-[12px] font-medium text-foreground">Compact Tables</p>
                <p className="text-[10px] text-muted-foreground">Reduce padding in data tables</p>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Default
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
              <div>
                <p className="text-[12px] font-medium text-foreground">Animations</p>
                <p className="text-[10px] text-muted-foreground">Transition effects and micro-interactions</p>
              </div>
              <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-[10px] font-medium text-success">
                Enabled
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
