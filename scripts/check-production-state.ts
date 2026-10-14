import * as NodeServices from "@effect/platform-node/NodeServices";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { ArtifactStore, createArtifactStore } from "alchemy/Artifacts";
import { AuthProviders } from "alchemy/Auth/AuthProvider";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Interaction from "alchemy/Interaction";
import * as State from "alchemy/State";
import { loadConfigProvider } from "alchemy/Util/ConfigProvider";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Option from "effect/Option";

import { isProductionState } from "./production-state.ts";

const check = Effect.gen(function* () {
  const environment = yield* loadConfigProvider(Option.none());
  const fs = yield* FileSystem.FileSystem;
  // A preflight must not resume a local, incomplete backend bootstrap.
  const dotAlchemy = yield* fs.makeTempDirectoryScoped({ prefix: "alchemy-prod-check-" });
  // This reader needs Alchemy's fail-closed/no-new-credential-cache mode even outside CI.
  const config = ConfigProvider.orElse(
    ConfigProvider.fromEnv({ env: { CI: "true" } }),
    environment,
  );

  return yield* Effect.gen(function* () {
    const accountId = yield* Config.String("CLOUDFLARE_ACCOUNT_ID");
    const store = yield* Effect.flatten(State.State);
    const state = yield* store.get({
      stack: "fairfield-consulting",
      stage: "prod",
      fqn: "website",
    });
    return isProductionState(state, accountId);
  }).pipe(
    Effect.provide(Cloudflare.state()),
    Effect.provideService(AuthProviders, {}),
    Effect.provideService(AlchemyContext, {
      dotAlchemy,
      dev: false,
      adopt: false,
      updateStateStore: false,
    }),
    Effect.provideService(ArtifactStore, createArtifactStore()),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(ConfigProvider.layer(config)),
  );
}).pipe(
  Effect.provide(Interaction.layerNonInteractive({ stdout: process.stderr, colors: false })),
  Effect.provide(NodeServices.layer),
  Effect.scoped,
);

const result = await Effect.runPromiseExit(check);
if (Exit.isFailure(result)) {
  console.error("Production state is unavailable or incompatible. Stop; do not deploy.");
  process.exitCode = 1;
} else if (!result.value) {
  console.error(
    "Production state does not match the healthy migrated apex owner. Stop; do not deploy.",
  );
  process.exitCode = 1;
} else {
  console.log("Verified migrated production Worker identity in the Cloudflare state store.");
}
