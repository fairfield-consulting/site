import * as Alchemy from "alchemy";
import { Stage } from "alchemy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export default Alchemy.Stack(
  "fairfield-consulting",
  {
    providers: Layer.merge(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state().pipe(
      Layer.provide(
        Layer.effect(
          AlchemyContext,
          Effect.gen(function* () {
            const context = yield* AlchemyContext;
            const stage = yield* Stage;
            return /^pr-[1-9][0-9]*$/.test(stage)
              ? { ...context, updateStateStore: false }
              : context;
          }),
        ),
      ),
    ),
  },
  Effect.gen(function* () {
    const stage = yield* Stage;
    const isPreview = /^pr-[1-9][0-9]*$/.test(stage);
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
        : isPreview
          ? { name: `fairfield-site-${stage}` }
          : {}),
      assets: {
        htmlHandling: "drop-trailing-slash",
      },
    });

    if (isPreview) {
      yield* GitHub.Comment("preview-comment", {
        owner: "fairfield-consulting",
        repository: "site",
        issueNumber: Number(stage.slice(3)),
        body: Output.interpolate`Preview: ${worker.url}`,
        allowDelete: true,
      });
    }

    return { url: worker.url };
  }),
);
