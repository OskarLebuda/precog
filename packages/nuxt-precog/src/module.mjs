// `nuxt-precog` is now `@precog/nuxt`, one package in a workspace that also ships
// `@precog/next`. This forwards to it so an existing install keeps working, and warns once so
// the rename does not go unnoticed.
import module from "@precog/nuxt";

console.warn(
  "[precog] `nuxt-precog` has been renamed to `@precog/nuxt`. This package only forwards to it.\n" +
    "         Run `npx nuxt module remove nuxt-precog && npx nuxt module add @precog/nuxt`.",
);

export * from "@precog/nuxt";
export default module;
