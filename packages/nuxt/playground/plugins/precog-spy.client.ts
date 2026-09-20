/**
 * Exposes the module to the e2e suite: the latest plan, and the instance itself, so a test
 * can flip an experimental option without a second build.
 */
export default defineNuxtPlugin({
  name: "playground:spy",
  dependsOn: ["precog-nuxt"],
  setup(nuxtApp) {
    const spy = window as unknown as { __precogPlan?: unknown; __precog?: unknown };
    spy.__precog = nuxtApp.$precog;
    nuxtApp.hook("precog:decision", (plan) => {
      spy.__precogPlan = plan;
    });
  },
});
