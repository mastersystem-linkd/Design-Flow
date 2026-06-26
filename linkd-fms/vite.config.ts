import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Split big, stable vendor libs into their own cacheable chunks so they
    // (a) load in parallel, (b) stay cached across app deploys (their hash
    // only changes when the lib upgrades, not when our code does), and
    // (c) keep the main `index` bundle lean. `exceljs` + `three` are only
    // ever dynamically imported, so these become on-demand chunks (export /
    // login) rather than part of the initial download.
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          recharts: ["recharts"],
          exceljs: ["exceljs"],
          three: ["three"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    // This project lives on a Google Drive mount (g:\My Drive\…). Google
    // Drive does NOT emit native filesystem events, so Vite's default
    // watcher never detects edits and HMR silently goes stale. Polling is
    // required here for hot-reload to work at all. (Costs a little CPU.)
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});
