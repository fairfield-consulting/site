import * as Alchemy from "alchemy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import { layerNonInteractive } from "alchemy/Interaction";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

// --yes approves preview changes, never shared-backend updates or a bootstrap resume.
const state = Layer.unwrap(
  Effect.gen(function* () {
    const context = yield* AlchemyContext;
    const fs = yield* FileSystem.FileSystem;
    const dotAlchemy = yield* fs.makeTempDirectoryScoped({ prefix: "site-preview-" });
    return Cloudflare.state().pipe(
      Layer.provide(
        Layer.succeed(AlchemyContext, { ...context, dotAlchemy, updateStateStore: false }),
      ),
      Layer.provide(layerNonInteractive()),
    );
  }),
).pipe(Layer.orDie);

export default Alchemy.Stack(
  "fairfield-consulting-previews",
  { providers: Layer.merge(Cloudflare.providers(), GitHub.providers()), state },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    if (!(yield* Config.Boolean("CI")) || !/^pr-[1-9][0-9]{0,8}$/.test(stage)) {
      return yield* Effect.die(new Error("Previews require CI and an exact pr-<number> stage."));
    }
    const number = Number(stage.slice(3));
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* Config.String("PREVIEW_ASSETS");
    if (!path.isAbsolute(directory) || (yield* fs.realPath(directory)) !== directory) {
      return yield* Effect.die(
        new Error("Preview assets require a dedicated canonical directory."),
      );
    }
    const pending = [directory];
    let file = pending.pop();
    let entries = 0;
    let bytes = 0;
    while (file !== undefined) {
      const info = yield* fs.stat(file);
      if (++entries > 20_000 || (yield* fs.realPath(file)) !== file) {
        return yield* Effect.die(
          new Error("Preview assets cannot contain links or excessive entries."),
        );
      }
      if (info.type === "Directory") {
        for (const name of yield* fs.readDirectory(file)) pending.push(path.join(file, name));
      } else if (
        info.type !== "File" ||
        Option.getOrElse(info.nlink, () => 0) !== 1 ||
        Number(info.size) > 25 * 1024 * 1024 ||
        (bytes += Number(info.size)) > 200 * 1024 * 1024
      ) {
        return yield* Effect.die(
          new Error("Preview assets must be bounded regular files, not links."),
        );
      }
      file = pending.pop();
    }
    const worker = yield* Cloudflare.Worker("website", {
      name: `fairfield-site-pr-${number}`,
      main: "./src/static-worker.ts",
      assets: { directory, htmlHandling: "drop-trailing-slash" },
      workersDev: { enabled: true, previewsEnabled: false },
    });
    yield* GitHub.Comment("preview-comment", {
      owner: "fairfield-consulting",
      repository: "site",
      issueNumber: number,
      body: Output.interpolate`Preview: ${worker.url}`,
      allowDelete: true,
    });
    return { url: worker.url };
  }).pipe(Effect.orDie),
);
