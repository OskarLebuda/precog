import type { PredictHookContext } from "./utils/predict.ts";

declare module "nitropack/types" {
  interface NitroRuntimeHooks {
    /** Read the state or set `ctx.prediction` to answer without calling Jev. */
    "precog:predict": (ctx: PredictHookContext) => void | Promise<void>;
  }
}

export {};
