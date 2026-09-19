import type { PredictedHookContext, PredictHookContext } from "./utils/predict.ts";

declare module "nitropack/types" {
  interface NitroRuntimeHooks {
    /** Read the state or set `ctx.prediction` to answer without calling Jev. */
    "precog:predict": (ctx: PredictHookContext) => void | Promise<void>;
    /** Every fresh prediction, after the fact. Use it to record or to log. */
    "precog:predicted": (ctx: PredictedHookContext) => void | Promise<void>;
  }
}

export {};
