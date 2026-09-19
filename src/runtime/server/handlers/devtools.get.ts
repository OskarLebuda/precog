import { defineEventHandler, setResponseHeader } from "h3";

/**
 * The DevTools tab. It lives in its own iframe, so it listens on a BroadcastChannel that the
 * overlay plugin posts to from the page. Development only; the module never registers it
 * in a production build.
 */
const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>precog</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0; padding: 12px; }
  h2 { font-size: 13px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .06em; opacity: .6; }
  dl { display: grid; grid-template-columns: 8rem 1fr; gap: 2px 10px; margin: 0; }
  dt { opacity: .6; }
  dd { margin: 0; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { border-top: 1px solid rgb(127 127 127 / 25%); padding: 6px 0; }
  .row { display: flex; gap: 8px; justify-content: space-between; }
  .urls { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .tag { border-radius: 999px; padding: 1px 7px; background: rgb(127 127 127 / 20%); }
  .prerender { background: rgb(60 200 130 / 30%); }
  .prefetch { background: rgb(90 170 255 / 30%); }
  .empty { opacity: .6; }
</style>
</head>
<body>
<h2>Metrics</h2>
<dl id="metrics"><dd class="empty">Waiting for the app.</dd></dl>
<h2>Decisions</h2>
<ol id="timeline"><li class="empty">Open a page that uses precog.</li></ol>
<script type="module">
const metricsEl = document.getElementById('metrics')
const timelineEl = document.getElementById('timeline')
const rows = [
  ['calls', (m) => m.calls + ' (' + m.cacheHits + ' cached, ' + m.errors + ' failed)'],
  ['latency', (m) => 'p50 ' + m.p50 + ' ms, p95 ' + m.p95 + ' ms'],
  ['tokens', (m) => m.inputTokens + ' in / ' + m.outputTokens + ' out'],
  ['cost', (m) => m.cost === null ? 'no prices configured' : '$' + m.cost.toFixed(4)],
  ['hit rate', (m) => Math.round(m.hitRate * 100) + '% of ' + m.navigations],
  ['top guess', (m) => Math.round(m.topAccuracy * 100) + '%'],
  ['activations', (m) => String(m.activations)],
]
const channel = new BroadcastChannel('precog')
channel.onmessage = (event) => {
  const data = event.data
  if (data.type === 'metrics') {
    metricsEl.innerHTML = rows
      .map(([label, read]) => '<dt>' + label + '</dt><dd>' + read(data.metrics) + '</dd>')
      .join('')
  }
  if (data.type === 'decision') {
    if (timelineEl.firstElementChild?.classList.contains('empty')) timelineEl.innerHTML = ''
    const urls = [
      ...data.plan.prerender.map((u) => ['prerender', u]),
      ...data.plan.prefetch.map((u) => ['prefetch', u]),
    ]
    const li = document.createElement('li')
    li.innerHTML =
      '<div class="row"><span>' + data.trigger + '</span><span>' +
      new Date(data.at).toLocaleTimeString() + '</span></div>' +
      '<div class="urls">' +
      (urls.length
        ? urls.map(([a, u]) => '<span class="tag ' + a + '">' + new URL(u).pathname + '</span>').join('')
        : '<span class="empty">nothing speculated</span>') +
      '</div>'
    timelineEl.prepend(li)
    while (timelineEl.children.length > 50) timelineEl.lastElementChild.remove()
  }
}
</script>
</body>
</html>`;

export default defineEventHandler((event) => {
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  return PAGE;
});
