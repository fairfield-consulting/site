import { layer as alchemistLayer } from "alchemy/Alchemist";
import { AlchemyContext } from "alchemy/AlchemyContext";
import * as Cloudflare from "alchemy/Cloudflare";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";

import { CiPolicyError } from "./ci-policy.ts";

// Keep the backend's captured context independent of resource adoption and --yes.
export const ciState = Layer.unwrap(
  Effect.gen(function* () {
    const context = yield* AlchemyContext;
    const config = yield* ConfigProvider.ConfigProvider;
    const fs = yield* FileSystem.FileSystem;
    const dotAlchemy = yield* fs.makeTempDirectoryScoped({ prefix: "ffc-ci-state-" });
    return Cloudflare.state().pipe(
      Layer.provide(
        Layer.succeed(AlchemyContext, { ...context, dotAlchemy, updateStateStore: false }),
      ),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.orElse(ConfigProvider.fromEnv({ env: { CI: "true" } }), config),
        ),
      ),
    );
  }),
).pipe(Layer.orDie);

export const ciRuntime = alchemistLayer().pipe(Layer.provideMerge(Logger.layer([])));

export async function runCi<A, E>(program: Effect.Effect<A, E>) {
  if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("Cloud operations run only in GitHub Actions.");
  }
  const result = await Effect.runPromiseExit(program);
  if (Exit.isFailure(result)) {
    for (const reason of result.cause.reasons) {
      if (reason._tag === "Die" && reason.defect instanceof CiPolicyError) throw reason.defect;
      if (reason._tag === "Fail" && reason.error instanceof CiPolicyError) throw reason.error;
    }
    // Native causes can contain derived credentials that GitHub does not mask.
    throw new Error("Native CI operation stopped. Preserve state; inspect the approved metadata.");
  }
  return result.value;
}
