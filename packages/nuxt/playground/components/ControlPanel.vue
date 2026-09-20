<script setup lang="ts">
type Mode = "off" | "native" | "precog";
const MODES: Mode[] = ["off", "native", "precog"];

const route = useRoute();
const mode = useCookie<Mode>("precog_mode", { default: () => "precog" });
const delay = useCookie<number>("precog_delay", { default: () => 0 });
const draft = ref(delay.value);

function choose(next: Mode) {
  mode.value = next;
  // A full reload, because the three arms differ in what loads at start-up.
  location.href = route.path;
}

function applyDelay() {
  delay.value = Number(draft.value);
  location.reload();
}
</script>

<template>
  <aside class="panel">
    <div class="modes">
      <button
        v-for="option in MODES"
        :key="option"
        type="button"
        :aria-pressed="mode === option"
        @click="choose(option)"
      >
        {{ option }}
      </button>
    </div>
    <label>
      server delay
      <input v-model="draft" type="range" min="0" max="1200" step="100" @change="applyDelay" />
      <output>{{ draft }} ms</output>
    </label>
    <p>
      <strong>off</strong> nothing warms links &middot; <strong>native</strong> the browser guesses
      on hover &middot; <strong>precog</strong> the model guesses before the hover. Shift+P for the
      overlay.
    </p>
  </aside>
</template>

<style scoped>
.panel {
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 2147483001;
  width: 19rem;
  background: #fff;
  border: 1px solid #d8d8d8;
  border-radius: 10px;
  padding: 10px 12px;
  font:
    12px/1.4 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  box-shadow: 0 8px 30px rgb(0 0 0 / 12%);
}

.modes {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

button {
  flex: 1;
  padding: 5px 0;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: #f6f6f6;
  font: inherit;
  cursor: pointer;
}

button[aria-pressed="true"] {
  background: #111;
  color: #fff;
  border-color: #111;
}

label {
  display: flex;
  align-items: center;
  gap: 6px;
}

input {
  flex: 1;
}

p {
  margin: 8px 0 0;
  color: #666;
}
</style>
