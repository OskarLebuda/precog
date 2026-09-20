/**
 * The three demo arms, kept in a cookie so they survive an in-app navigation.
 * `off` and `native` both stop the module through its own public API; `native` then adds the
 * document rule set a site would write by hand, so the comparison is fair.
 */
export default defineNuxtPlugin({
  name: "playground:modes",
  dependsOn: ["@precog/nuxt"],
  setup() {
    const mode = useCookie<string>("precog_mode", { default: () => "precog" });
    const fromQuery = new URLSearchParams(location.search).get("mode");
    if (fromQuery) mode.value = fromQuery;
    if (mode.value === "precog") return;

    usePrecog().pause();
    if (mode.value !== "native") return;

    const script = document.createElement("script");
    script.type = "speculationrules";
    script.dataset.native = "true";
    script.textContent = JSON.stringify({
      prefetch: [
        {
          source: "document",
          eagerness: "moderate",
          where: {
            and: [
              { href_matches: "/*" },
              { not: { href_matches: "/logout" } },
              { not: { href_matches: "/cart/*" } },
            ],
          },
        },
      ],
    });
    document.head.append(script);
  },
});
