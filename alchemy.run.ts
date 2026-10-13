import * as Alchemy from "alchemy";
import { Stage } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "fairfield-consulting",
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const stage = yield* Stage;
    const worker = yield* Cloudflare.Website.StaticSite("website", {
      main: "./src/static-worker.ts",
      command: "pnpm run build",
      outdir: "dist",
      ...(stage === "prod" ? { domain: "fairfieldconsulting.llc" } : {}),
      assets: {
        htmlHandling: "drop-trailing-slash",
      },
    });

    return { url: worker.url };
  }),
);
