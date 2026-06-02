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
