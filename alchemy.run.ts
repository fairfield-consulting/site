import * as Alchemy from "alchemy";
import { Stage } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "fairfield-consulting",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const stage = yield* Stage;
    const worker = yield* Cloudflare.Website.StaticSite("website", {
      main: "./src/static-worker.ts",
      command: "pnpm run build",
      outdir: "dist",
      ...(stage === "prod"
        ? {
            domain: "fairfieldconsulting.llc",
            // Recovery must select the apex owner, not one of its identically tagged peers.
            name: "fairfield-consulting-worker-prod-5hd5v3cmaxxxlw4w",
          }
        : {}),
      assets: {
        htmlHandling: "drop-trailing-slash",
      },
    });

    return { url: worker.url };
  }),
);
