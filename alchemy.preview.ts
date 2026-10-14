import * as Alchemy from "alchemy";
import { Stage } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

import { PREVIEW_STACK, previewStage } from "./scripts/ci-policy.ts";
import { ciState } from "./scripts/ci-state.ts";

export default Alchemy.Stack(
  PREVIEW_STACK,
  { providers: Cloudflare.providers(), state: ciState },
  Effect.gen(function* () {
    const identity = previewStage(yield* Stage);
    const directory = yield* Config.String("PREVIEW_ASSETS_DIRECTORY");
    const worker = yield* Cloudflare.Worker("website", {
      name: identity.worker,
      workersDev: { enabled: true, previewsEnabled: false },
      assets: { directory, htmlHandling: "drop-trailing-slash" },
    });
    return { url: worker.url };
  }),
);
