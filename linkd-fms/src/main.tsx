import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/hooks/useTheme";
import { AuthProvider } from "@/hooks/useAuth";
import { LoaderProvider } from "@/components/ui";
// Display (Sora) + body (Manrope) load via the Google Fonts <link> in
// index.html. JetBrains Mono is self-hosted for the tabular data numerals.
import "@fontsource/jetbrains-mono/700.css";
// Fraunces variable serif — opt-in display accent (greetings, page mastheads,
// person names, empty-state headlines) via the `.font-serif-accent` class.
// `full` = the complete variable face (opsz 9-144 + wght 100-900) so
// `font-optical-sizing: auto` actually drives the optical axis; `full-italic`
// gives a true italic for the greeting flourish. Family: "Fraunces Variable".
// font-display:swap is built in — never import a static weight file.
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "@/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,    // 2 min — internal tool, data changes slowly
      gcTime: 10 * 60 * 1000,      // 10 min garbage collection
      retry: 1,
      refetchOnWindowFocus: false, // don't spam refetches on tab focus
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <LoaderProvider>
              <App />
            </LoaderProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
