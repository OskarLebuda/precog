import { defineEventHandler, getCookie, getQuery } from "h3";

/**
 * Artificial server latency, so a warmed navigation is something you can see on a recording.
 * Set it with `?delay=400` or from the control panel, which stores it in a cookie.
 */
export default defineEventHandler(async (event) => {
  const fromQuery = Number(getQuery(event).delay);
  const fromCookie = Number(getCookie(event, "precog_delay"));
  const delay = Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : fromCookie;
  if (!Number.isFinite(delay) || delay <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 3000)));
});
