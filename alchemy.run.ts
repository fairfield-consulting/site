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
            // Preview --yes must not bootstrap or upgrade the account-shared backend.
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
    const github = yield* GitHub.GitHubEnv;
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

    if (isPreview && github?.pr) {
      yield* GitHub.Comment("preview-comment", {
        owner: github.owner,
        repository: github.repository,
        issueNumber: github.pr,
        body: Output.interpolate`Preview: ${worker.url}\nCommit: ${github.sha}`,
        allowDelete: true,
      });
    }

    return { url: worker.url };
  }),
);
