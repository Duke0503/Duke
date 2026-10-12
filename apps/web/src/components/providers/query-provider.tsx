"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * The single TanStack Query client for the app.
 *
 * `useState` rather than a module-level singleton on purpose: a shared client
 * would leak cached server data between users when we render on the server.
 *
 * All server state (characters, sessions, history, usage) goes through here.
 * UI state (mic on/off, open sheet, live waveform) stays in plain React state.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
