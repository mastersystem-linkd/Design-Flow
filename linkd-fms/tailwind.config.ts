import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // ── Legacy tokens (resolved per theme via CSS variables) ──
        ink: "rgb(var(--ink) / <alpha-value>)",
        cream: "rgb(var(--cream) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",

        // ── Named tokens ──
        sidebar: "rgb(var(--sidebar) / <alpha-value>)",
        dashboard: "rgb(var(--dashboard) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        coral: "rgb(var(--coral) / <alpha-value>)",

        // ── Semantic tokens (shadcn-style, CSS variable backed) ──
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        border: "rgb(var(--border) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        input: "rgb(var(--input) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
      },
      fontFamily: {
        // ONE family app-wide. `sans`, `serif`, and `display` all resolve to
        // Sora so `font-sans` / `font-serif` / `font-display` can never pull a
        // different face. Only `mono-data` differs — tabular DATA numerals.
        sans: ["Sora", "system-ui", "-apple-system", "sans-serif"],
        serif: ["Sora", "system-ui", "-apple-system", "sans-serif"],
        display: ["Sora", "system-ui", "-apple-system", "sans-serif"],
        "mono-data": ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "2xl": "16px",
        xl: "14px",
        lg: "12px",
        md: "8px",
        sm: "6px",
        pill: "9999px",
      },
      boxShadow: {
        // Spec-aligned aliases backed by CSS variables so they adapt
        // per-theme. Use as `shadow-card` / `shadow-card-hover` etc.
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        "card-elevated": "var(--shadow-card-elevated)",
        dropdown: "var(--shadow-dropdown)",
        overlay: "var(--shadow-overlay)",
        // Command-Center brand glow — `shadow-glow` / `shadow-glow-soft`.
        glow: "var(--glow-primary)",
        "glow-soft": "var(--glow-soft)",
        "input-focus": "var(--shadow-input-focus)",
        // Layered, colored ambient shadows — premium "floating" depth that
        // picks up the tile's tone. Token-driven so they re-tint per theme.
        "glow-success": "0 10px 34px -10px rgb(var(--success) / 0.40)",
        "glow-warning": "0 10px 34px -10px rgb(var(--warning) / 0.40)",
        "glow-destructive": "0 10px 34px -10px rgb(var(--destructive) / 0.40)",
      },
      transitionTimingFunction: {
        spring: "var(--ease-spring)",
        "spring-heavy": "var(--ease-spring-heavy)",
        "out-expo": "var(--ease-out-expo)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
      },
      keyframes: {
        "spring-scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.92)" },
          "60%":  { opacity: "1", transform: "scale(1.02)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "spring-slide-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "60%":  { opacity: "1", transform: "translateY(-2px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "spring-scale-in": "spring-scale-in 400ms var(--ease-spring) both",
        "spring-slide-up": "spring-slide-up 350ms var(--ease-spring) both",
      },
      backgroundImage: {
        // Brand-anchor gradient used by hero KPIs. Same in light + dark
        // — see LINKD-FMS-UI-REDESIGN.md §5.3.
        "hero-gradient": "var(--brand-gradient)",
        // Radial brand glow + faint data-grid for premium panel backdrops.
        "glow-radial":
          "radial-gradient(circle at 50% 0%, rgb(var(--primary) / 0.10), transparent 70%)",
        "grid-fade":
          "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "32px 32px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
