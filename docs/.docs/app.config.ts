// undocs derives the whole Nuxt UI palette from `themeColor`, and that value has to be a CSS
// colour because the og-image generator passes it straight into a gradient. A palette name
// crashes that build; a hex leaves Nuxt UI with no palette and renders the primary button
// black on black.
//
// So `themeColor` stays a hex for the og image, and the palette is set here instead. `.docs`
// is a Nuxt layer, so this app config wins over the one undocs puts in its nuxt.config.
export default defineAppConfig({
  ui: {
    colors: {
      primary: "neutral",
      neutral: "neutral",
    },
  },
});
