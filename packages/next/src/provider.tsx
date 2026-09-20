"use client";

/**
 * Runs the orchestrator in a Next App Router app.
 *
 * Effector A is the Speculation Rules script, which the core writes itself. Effector B is
 * `router.prefetch`, Next's own warm-up: it fetches the route's RSC payload and its chunks,
 * which is the Next equivalent of what the Nuxt adapter does with `preloadPayload`.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Precog, PredictionFailed } from "precog-core/client";
import type { MetricsSummary } from "precog-core/client";
import type { PrecogPlan, PrecogPrediction, PrecogState } from "precog-core";
import { withDefaults, type PrecogOptions } from "./options";

export interface PrecogContextValue {
  /** Null until the orchestrator has started in the browser. */
  precog: Precog | null;
  plan: PrecogPlan | null;
  metrics: MetricsSummary | null;
}

const PrecogContext = createContext<PrecogContextValue>({
  precog: null,
  plan: null,
  metrics: null,
});

export function usePrecogContext() {
  return useContext(PrecogContext);
}

export interface PrecogProviderProps extends PrecogOptions {
  children?: ReactNode;
}

export function PrecogProvider({ children, ...options }: PrecogProviderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const resolved = useMemo(() => withDefaults(options), [JSON.stringify(options)]);
  const [precog, setPrecog] = useState<Precog | null>(null);
  const [plan, setPlan] = useState<PrecogPlan | null>(null);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);

  // Kept in refs so the effect that starts the orchestrator does not depend on them.
  const routerRef = useRef(router);
  routerRef.current = router;
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (!resolved.enabled) return;
    if (new URLSearchParams(location.search).get("precog") === "off") return;

    const instance = new Precog({
      options: resolved,
      post: async (state: PrecogState, signal: AbortSignal) => {
        const response = await fetch(resolved.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(state),
          signal,
        });
        if (!response.ok) {
          // The server says why in a header; without it a failure is just a counter.
          throw new PredictionFailed(
            response.headers.get("x-precog-reason") || `request failed with ${response.status}`,
          );
        }
        return (await response.json()) as PrecogPrediction;
      },
      preload: (urls) => {
        for (const url of urls) {
          const { pathname: path, search } = new URL(url);
          // Next warms the RSC payload and the route's chunks for us.
          try {
            routerRef.current.prefetch(path + search);
          } catch {
            // A route Next cannot resolve is not worth failing a prediction over.
          }
        }
      },
      emitDecision: (next) => setPlan(next),
      emitMetrics: (summary) => setMetrics(summary),
    });

    instance.start();
    setPrecog(instance);
    setMetrics(instance.metrics);

    return () => {
      instance.stop();
      setPrecog(null);
    };
  }, [resolved]);

  // The App Router changes `pathname` without remounting, so the orchestrator is told by hand.
  useEffect(() => {
    if (!precog) return;
    const from = previousPath.current;
    previousPath.current = pathname;
    if (from !== null && from !== pathname) precog.onRouteChange(from);
  }, [pathname, precog]);

  const value = useMemo<PrecogContextValue>(
    () => ({ precog, plan, metrics }),
    [precog, plan, metrics],
  );

  return <PrecogContext.Provider value={value}>{children}</PrecogContext.Provider>;
}
