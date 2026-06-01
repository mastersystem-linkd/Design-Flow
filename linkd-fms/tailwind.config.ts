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
        sans: ["Manrope", "system-ui", "-apple-system", "sans-serif"],
        serif: ["Manrope", "system-ui", "-apple-system", "sans-serif"],
        display: ["Sora", "system-ui", "-apple-system", "sans-serif"],
        "mono-data": ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "12px",
        md: "8px",
        sm: "6px",
        pill: "20px",
      },
      boxShadow: {
        // Spec-aligned aliases backed by CSS variables so they adapt
        // per-theme. Use as `shadow-card` / `shadow-card-hover` etc.
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        dropdown: "var(--shadow-dropdown)",
        overlay: "var(--shadow-overlay)",
        // Command-Center brand glow — `shadow-glow` / `shadow-glow-soft`.
        glow: "var(--glow-primary)",
        "glow-soft": "var(--glow-soft)",
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
