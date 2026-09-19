/** Exposes the latest plan on `window`, so the e2e suite can check what the policy chose. */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("precog:decision", (plan) => {
    (window as unknown as { __precogPlan?: unknown }).__precogPlan = plan;
  });
});
