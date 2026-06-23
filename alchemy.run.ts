import * as Alchemy from "alchemy";
import { Stage } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "fairfield-consulting",
  { providers: Cloudflare.providers() },
  Effect.gen(function* () {
    const stage = yield* Stage;
    const worker = yield* Cloudflare.StaticSite("website", {
      main: "./src/static-worker.ts",
      command: "bun run build",
      outdir: "dist",
      ...(stage === "prod" ? { domain: "fairfieldconsulting.llc" } : {}),
      assetsConfig: {
        htmlHandling: "drop-trailing-slash",
      },
    });

    return { url: worker.url };
  }),
);
