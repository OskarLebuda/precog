<script setup lang="ts">
import { useDevtoolsClient } from "@nuxt/devtools-kit/iframe-client";
import type { MetricsSummary, PrecogPlan, PrecogTrigger } from "../src/module";
import type { Precog } from "../src/runtime/core/orchestrator";

interface Entry {
  at: number;
  trigger: PrecogTrigger;
  plan: PrecogPlan;
}

const MAX_ENTRIES = 50;

const client = useDevtoolsClient();

const precog = shallowRef<Precog | null>(null);
const metrics = shallowRef<MetricsSummary | null>(null);
const plan = shallowRef<PrecogPlan | null>(null);
const timeline = ref<Entry[]>([]);
const paused = ref(false);

// The module lives in the host page, not on the server, so the tab reads it straight off the
// host Nuxt app rather than over RPC.
watchEffect((onCleanup) => {
  const nuxt = client.value?.host?.nuxt as
    | { $precog?: Precog; hooks: { hook: (name: string, fn: unknown) => () => void } }
    | undefined;
  if (!nuxt) return;

  const instance = nuxt.$precog ?? null;
  precog.value = instance;
  metrics.value = instance?.metrics ?? null;
  plan.value = instance?.plan ?? null;
  paused.value = instance ? !instance.enabled : false;

  const offDecision = nuxt.hooks.hook(
    "precog:decision",
    (next: PrecogPlan, trigger: PrecogTrigger) => {
      plan.value = next;
      timeline.value = [{ at: Date.now(), trigger, plan: next }, ...timeline.value].slice(
        0,
        MAX_ENTRIES,
      );
    },
  );
  const offMetrics = nuxt.hooks.hook("precog:metrics", (summary: MetricsSummary) => {
    metrics.value = summary;
    paused.value = instance ? !instance.enabled : false;
  });

  onCleanup(() => {
    offDecision();
    offMetrics();
  });
});

const speculated = computed(() => [
  ...(plan.value?.prerender ?? []).map((url) => ({ url: path(url), action: "prerender" })),
  ...(plan.value?.prefetch ?? []).map((url) => ({ url: path(url), action: "prefetch" })),
]);

const ranked = computed(() =>
  (plan.value?.decisions ?? []).slice(0, 12).map((decision) => ({
    ...decision,
    percent: Math.round(decision.p * 100),
  })),
);

function toggle() {
  const instance = precog.value;
  if (!instance) return;
  if (instance.enabled) instance.pause();
  else instance.resume();
  paused.value = !instance.enabled;
  if (paused.value) plan.value = null;
}

function refresh() {
  precog.value?.refresh();
}

function reset() {
  precog.value?.telemetry.reset();
  metrics.value = precog.value?.metrics ?? null;
  timeline.value = [];
}

function path(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

const percent = (value: number | null) => (value === null ? "n/a" : `${Math.round(value * 100)}%`);
const time = (at: number) => new Date(at).toLocaleTimeString();
</script>

<template>
  <main class="precog">
    <header>
      <div>
        <h1>precog</h1>
        <p v-if="precog">
          {{ paused ? "paused" : "watching" }} &middot; last trigger
          {{ precog.lastTrigger ?? "none" }}
        </p>
        <p v-else-if="client">The module is not running on this page.</p>
        <p v-else>Waiting for the host page.</p>
      </div>
      <div class="actions">
        <button type="button" :disabled="!precog" @click="toggle">
          {{ paused ? "Resume" : "Pause" }}
        </button>
        <button type="button" :disabled="!precog || paused" @click="refresh">Predict now</button>
        <button type="button" :disabled="!precog" @click="reset">Reset counters</button>
      </div>
    </header>

    <section v-if="metrics">
      <h2>Metrics</h2>
      <dl>
        <dt>calls</dt>
        <dd>{{ metrics.calls }} ({{ metrics.cacheHits }} cached, {{ metrics.errors }} failed)</dd>
        <dt>jev latency</dt>
        <dd>p50 {{ metrics.p50 }} ms &middot; p95 {{ metrics.p95 }} ms</dd>
        <dt>tokens</dt>
        <dd>{{ metrics.inputTokens }} in / {{ metrics.outputTokens }} out</dd>
        <dt>cost</dt>
        <dd v-if="metrics.cost !== null">about ${{ metrics.cost.toFixed(4) }}, an estimate</dd>
        <dd v-else>no prices configured</dd>
        <dt>hit rate</dt>
        <dd>{{ percent(metrics.hitRate) }} of {{ metrics.navigations }} navigations</dd>
        <dt>top guess</dt>
        <dd>{{ percent(metrics.topAccuracy) }} correct</dd>
        <dt>activations</dt>
        <dd>{{ metrics.activations }} page loads served from a speculative load</dd>
        <template v-if="metrics.lastError">
          <dt>last error</dt>
          <dd class="error">{{ metrics.lastError }}</dd>
        </template>
      </dl>
    </section>

    <section>
      <h2>Speculating now</h2>
      <ul v-if="speculated.length" class="plain">
        <li v-for="item in speculated" :key="item.url">
          <code>{{ item.url }}</code>
          <span :class="item.action">{{ item.action }}</span>
        </li>
      </ul>
      <p v-else class="quiet">Nothing speculated.</p>
    </section>

    <section v-if="ranked.length">
      <h2>Ranking</h2>
      <ul class="bars">
        <li v-for="decision in ranked" :key="decision.id">
          <span class="bar" :style="{ width: `${Math.max(decision.percent, 1)}%` }" />
          <code>{{ decision.path }}</code>
          <span class="value">{{ decision.percent }}%</span>
          <span class="reason">{{
            decision.action === "none" ? decision.reason : decision.action
          }}</span>
        </li>
      </ul>
    </section>

    <section>
      <h2>Decisions</h2>
      <ol v-if="timeline.length" class="plain">
        <li v-for="entry in timeline" :key="entry.at">
          <div class="row">
            <span>{{ entry.trigger }}</span>
            <span class="quiet">{{ time(entry.at) }}</span>
          </div>
          <div class="tags">
            <span v-for="url in entry.plan.prerender" :key="url" class="tag prerender">
              {{ path(url) }}
            </span>
            <span v-for="url in entry.plan.prefetch" :key="url" class="tag prefetch">
              {{ path(url) }}
            </span>
            <span v-if="!entry.plan.prerender.length && !entry.plan.prefetch.length" class="quiet">
              nothing speculated
            </span>
          </div>
        </li>
      </ol>
      <p v-else class="quiet">Open a page that uses precog.</p>
    </section>
  </main>
</template>

<style>
:root {
  color-scheme: light dark;
  --precog-line: rgb(127 127 127 / 25%);
  --precog-quiet: rgb(127 127 127);
  --precog-prerender: rgb(40 170 100);
  --precog-prefetch: rgb(60 140 245);
}

body {
  margin: 0;
  font:
    13px/1.5 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}

.precog {
  padding: 14px 16px 32px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

h1 {
  font-size: 15px;
  margin: 0;
}

h2 {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--precog-quiet);
  margin: 22px 0 8px;
}

header p {
  margin: 2px 0 0;
  color: var(--precog-quiet);
}

.actions {
  display: flex;
  gap: 6px;
}

button {
  font: inherit;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--precog-line);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--precog-quiet);
}

button:disabled {
  opacity: 0.45;
  cursor: default;
}

dl {
  display: grid;
  grid-template-columns: 7.5rem 1fr;
  gap: 3px 12px;
  margin: 0;
}

dt {
  color: var(--precog-quiet);
}

dd {
  margin: 0;
}

ul.plain,
ol.plain {
  list-style: none;
  margin: 0;
  padding: 0;
}

ul.plain li,
ol.plain li {
  border-top: 1px solid var(--precog-line);
  padding: 6px 0;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

ol.plain li {
  display: block;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.tag {
  border-radius: 999px;
  padding: 1px 8px;
  background: rgb(127 127 127 / 18%);
}

.tag.prerender,
.prerender {
  color: var(--precog-prerender);
}

.tag.prefetch,
.prefetch {
  color: var(--precog-prefetch);
}

.tag.prerender {
  background: rgb(40 170 100 / 20%);
}

.tag.prefetch {
  background: rgb(60 140 245 / 18%);
}

ul.bars {
  list-style: none;
  margin: 0;
  padding: 0;
}

ul.bars li {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 3rem 6rem;
  gap: 10px;
  align-items: center;
  padding: 4px 6px;
  border-radius: 4px;
}

.bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgb(60 140 245 / 16%);
  border-radius: 4px;
  pointer-events: none;
}

.value {
  text-align: right;
}

.reason,
.quiet {
  color: var(--precog-quiet);
}

.error {
  color: rgb(235 110 95);
}
</style>
