"use client";

/**
 * The debug overlay: a probability on every candidate, the top guess outlined, and a HUD.
 *
 * Everything is fixed or absolutely placed and nothing below it is touched, so turning it on
 * never moves the page. Render it inside `<PrecogProvider>` and gate it on `NODE_ENV` if you
 * do not want it in production.
 */

import { useCallback, useEffect, useState } from "react";
import { usePrecogContext } from "./provider";

interface Badge {
  id: string;
  label: string;
  action: string;
  top: number;
  left: number;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

function path(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export interface PrecogOverlayProps {
  /** Open from the first render. `?precog=debug` does the same, Shift+P toggles it. */
  defaultOpen?: boolean;
}

export function PrecogOverlay({ defaultOpen = false }: PrecogOverlayProps) {
  const { precog, plan, metrics } = usePrecogContext();
  const [open, setOpen] = useState(defaultOpen);
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("precog") === "debug") setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key.toLowerCase() === "p") setOpen((value) => !value);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const measure = useCallback(() => {
    if (!open || !plan || !precog) {
      setBadges([]);
      return;
    }
    const top = plan.decisions.find((decision) => decision.action !== "none")?.id;
    setBadges(
      plan.decisions.flatMap((decision) => {
        // Rounding to zero means the badge would say nothing and only crowd the page.
        const value = Math.round(decision.p * 100);
        if (value < 1) return [];
        const element = precog.elementOf(decision.id);
        if (!element) return [];
        const rect = element.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight) return [];
        return [
          {
            id: decision.id,
            label: `${value}%`,
            action: decision.id === top ? `${decision.action} top` : decision.action,
            top: rect.top + scrollY,
            left: rect.right + scrollX + 6,
          },
        ];
      }),
    );
  }, [open, plan, precog]);

  useEffect(() => {
    measure();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule, { passive: true });
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measure]);

  if (!open) return null;

  const speculated = [
    ...(plan?.prerender ?? []).map((url) => ({ url: path(url), action: "prerender" })),
    ...(plan?.prefetch ?? []).map((url) => ({ url: path(url), action: "prefetch" })),
  ];

  return (
    <div className="precog">
      <style>{STYLES}</style>
      {badges.map((badge) => (
        <div
          key={badge.id}
          className="precog-badge"
          data-action={badge.action}
          style={{ top: `${badge.top}px`, left: `${badge.left}px` }}
        >
          {badge.label}
        </div>
      ))}

      <aside className="precog-hud">
        <header>
          <strong>precog</strong>
          <span>{precog?.lastTrigger ?? "idle"}</span>
        </header>

        {metrics ? (
          <dl>
            <dt>calls</dt>
            <dd>
              {metrics.calls} ({metrics.cacheHits} cached, {metrics.errors} failed)
            </dd>
            <dt>jev latency</dt>
            <dd>
              p50 {metrics.p50} ms &middot; p95 {metrics.p95} ms
            </dd>
            <dt>tokens</dt>
            <dd>
              {metrics.inputTokens} in / {metrics.outputTokens} out
              {metrics.cost === null
                ? " · no prices configured"
                : ` · about $${metrics.cost.toFixed(4)}`}
            </dd>
            <dt>hit rate</dt>
            <dd>
              {percent(metrics.hitRate)} of {metrics.navigations} &middot; top{" "}
              {percent(metrics.topAccuracy)}
            </dd>
            <dt>activations</dt>
            <dd>{metrics.activations} page loads served from a speculative load</dd>
            {metrics.lastError ? (
              <>
                <dt>last error</dt>
                <dd className="precog-error">{metrics.lastError}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="precog-quiet">Waiting for the first prediction.</p>
        )}

        <ul>
          {speculated.map((item) => (
            <li key={item.url} data-action={item.action}>
              <code>{item.url}</code>
              <span>{item.action}</span>
            </li>
          ))}
          {speculated.length === 0 ? <li className="precog-quiet">Nothing speculated.</li> : null}
        </ul>

        <footer>
          Shift+P to hide &middot; <code>?precog=off</code> to disable &middot; estimates only
        </footer>
      </aside>
    </div>
  );
}

const STYLES = `
.precog {
  position: absolute;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.precog-badge {
  position: absolute;
  padding: 1px 5px;
  border-radius: 999px;
  background: #d9d9d9;
  color: #1a1a1a;
  border: 1px solid transparent;
  white-space: nowrap;
}
.precog-badge[data-action~="prefetch"] { background: #9ad0ff; }
.precog-badge[data-action~="prerender"] { background: #7ce0a3; }
.precog-badge[data-action~="top"] { border-color: #111; font-weight: 700; }
.precog-hud {
  position: fixed;
  right: 12px;
  bottom: 12px;
  width: 21rem;
  max-height: 70vh;
  overflow: auto;
  pointer-events: auto;
  background: #101014;
  color: #e9e9ef;
  border-radius: 10px;
  padding: 10px 12px;
  box-shadow: 0 8px 30px rgb(0 0 0 / 35%);
}
.precog-hud header {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #2a2a33;
  padding-bottom: 6px;
  margin-bottom: 6px;
}
.precog-hud dl {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 2px 8px;
  margin: 0 0 8px;
}
.precog-hud dt { color: #8f8fa3; }
.precog-hud dd { margin: 0; }
.precog-hud ul { list-style: none; margin: 0 0 8px; padding: 0; }
.precog-hud li { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
.precog-hud li[data-action="prerender"] span { color: #7ce0a3; }
.precog-hud li[data-action="prefetch"] span { color: #9ad0ff; }
.precog-hud footer, .precog-quiet { color: #8f8fa3; }
.precog-error { color: #ff9a8f; }
`;
