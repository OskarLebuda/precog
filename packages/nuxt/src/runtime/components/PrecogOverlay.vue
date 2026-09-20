<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Precog } from "@precog/core/client";
import type { MetricsSummary } from "@precog/core/client";
import type { PrecogPlan } from "@precog/core";

const props = defineProps<{
  precog: Precog;
  plan: PrecogPlan | null;
  metrics: MetricsSummary | null;
  open: boolean;
}>();

interface Badge {
  id: string;
  label: string;
  action: string;
  top: number;
  left: number;
}

const badges = ref<Badge[]>([]);
let frame = 0;

function measure() {
  if (!props.open || !props.plan) {
    badges.value = [];
    return;
  }
  const top = props.plan.decisions.find((decision) => decision.action !== "none")?.id;
  badges.value = props.plan.decisions.flatMap((decision) => {
    // Rounding to zero means the badge would say nothing and only crowd the page.
    const percentage = Math.round(decision.p * 100);
    if (percentage < 1) return [];
    const element = props.precog.elementOf(decision.id);
    if (!element) return [];
    const rect = element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return [];
    return [
      {
        id: decision.id,
        label: `${percentage}%`,
        action: decision.id === top ? `${decision.action} top` : decision.action,
        top: rect.top + scrollY,
        left: rect.right + scrollX + 6,
      },
    ];
  });
}

function scheduleMeasure() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    measure();
  });
}

onMounted(() => {
  addEventListener("scroll", scheduleMeasure, { passive: true });
  addEventListener("resize", scheduleMeasure, { passive: true });
  measure();
});

onBeforeUnmount(() => {
  removeEventListener("scroll", scheduleMeasure);
  removeEventListener("resize", scheduleMeasure);
});

watch(() => [props.plan, props.open], scheduleMeasure);

const speculated = computed(() => [
  ...(props.plan?.prerender ?? []).map((url) => ({ url: path(url), action: "prerender" })),
  ...(props.plan?.prefetch ?? []).map((url) => ({ url: path(url), action: "prefetch" })),
]);

const percent = (value: number) => `${Math.round(value * 100)}%`;
const money = (value: number) => `$${value.toFixed(4)}`;

function path(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
</script>

<template>
  <div v-if="open" class="precog">
    <div
      v-for="badge in badges"
      :key="badge.id"
      class="precog-badge"
      :data-action="badge.action"
      :style="{ top: `${badge.top}px`, left: `${badge.left}px` }"
    >
      {{ badge.label }}
    </div>

    <aside class="precog-hud">
      <header>
        <strong>precog</strong>
        <span>{{ precog.lastTrigger ?? "idle" }}</span>
      </header>

      <dl v-if="metrics">
        <dt>calls</dt>
        <dd>{{ metrics.calls }} ({{ metrics.cacheHits }} cached, {{ metrics.errors }} failed)</dd>
        <dt>jev latency</dt>
        <dd>p50 {{ metrics.p50 }} ms &middot; p95 {{ metrics.p95 }} ms</dd>
        <dt>tokens</dt>
        <dd>
          {{ metrics.inputTokens }} in / {{ metrics.outputTokens }} out
          <template v-if="metrics.cost !== null">
            &middot; about {{ money(metrics.cost) }}
          </template>
          <template v-else> &middot; no prices configured </template>
        </dd>
        <dt>hit rate</dt>
        <dd>
          {{ percent(metrics.hitRate) }} of {{ metrics.navigations }} &middot; top
          {{ percent(metrics.topAccuracy) }}
        </dd>
        <dt>activations</dt>
        <dd>{{ metrics.activations }} page loads served from a speculative load</dd>
        <template v-if="metrics.lastError">
          <dt>last error</dt>
          <dd class="precog-error">{{ metrics.lastError }}</dd>
        </template>
      </dl>
      <p v-else class="precog-quiet">Waiting for the first prediction.</p>

      <ul>
        <li v-for="item in speculated" :key="item.url" :data-action="item.action">
          <code>{{ item.url }}</code>
          <span>{{ item.action }}</span>
        </li>
        <li v-if="speculated.length === 0" class="precog-quiet">Nothing speculated.</li>
      </ul>

      <footer>
        Shift+P to hide &middot; <code>?precog=off</code> to disable &middot; estimates only
      </footer>
    </aside>
  </div>
</template>

<style scoped>
/* Everything is fixed or absolutely placed, so the page below never moves. */
.precog {
  position: absolute;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  font:
    12px/1.4 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
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

.precog-badge[data-action~="prefetch"] {
  background: #9ad0ff;
}

.precog-badge[data-action~="prerender"] {
  background: #7ce0a3;
}

.precog-badge[data-action~="top"] {
  border-color: #111;
  font-weight: 700;
}

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

.precog-hud dt {
  color: #8f8fa3;
}

.precog-hud dd {
  margin: 0;
}

.precog-hud ul {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
}

.precog-hud li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
}

.precog-hud li[data-action="prerender"] span {
  color: #7ce0a3;
}

.precog-hud li[data-action="prefetch"] span {
  color: #9ad0ff;
}

.precog-error {
  color: #ff9a8f;
}

.precog-hud footer,
.precog-quiet {
  color: #8f8fa3;
}
</style>
