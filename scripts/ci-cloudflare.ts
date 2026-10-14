import * as workers from "@distilled.cloud/cloudflare/workers";
import * as zones from "@distilled.cloud/cloudflare/zones";
import { AuthProviders } from "alchemy/Auth/AuthProvider";
import { CloudflareApiLive } from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import {
  APEX,
  PROD_STACK,
  PROD_WORKER,
  requireCondition,
  type PreviewIdentity,
} from "./ci-policy.ts";

export const cloudApi = CloudflareApiLive().pipe(Layer.provide(Layer.succeed(AuthProviders, {})));

export interface OwnerSnapshot {
  accountId: string;
  worker: string;
  domain: {
    id: string;
    hostname: string;
    service: string;
    environment: string;
    zoneId: string;
    zoneName: string;
  };
  logicalTag: string;
  deployment: {
    id: string;
    createdOn: string;
    strategy: string;
    versions: { versionId: string; percentage: number }[];
  };
  versions: {
    id: string;
    number: number | null;
    createdOn: string | null;
    etag: string | null;
    migrationTag: string | null;
  }[];
}

const permittedBindings: Record<string, true> = {
  ALCHEMY_PHASE: true,
  ALCHEMY_WORKER_NAME: true,
  ALCHEMY_STACK_NAME: true,
  ALCHEMY_STAGE: true,
  ALCHEMY_CLOUDFLARE_ACCOUNT_ID: true,
};

export function assertStaticBindings(bindings: unknown) {
  requireCondition(
    Array.isArray(bindings) &&
      bindings.every(
        (binding) =>
          binding &&
          typeof binding === "object" &&
          ((binding.type === "assets" && binding.name === "ASSETS") ||
            (binding.type === "plain_text" && Object.hasOwn(permittedBindings, binding.name))),
      ),
    "Unexpected bindings; review preservation before recovery.",
  );
}

function staticExports(exports: Record<string, { type: string } | undefined> | null | undefined) {
  return (
    exports === undefined ||
    exports === null ||
    Object.entries(exports).every(([name, value]) => name === "default" && value?.type === "worker")
  );
}

export const ownerSnapshot = Effect.fn("site.ownerSnapshot")(function* (accountId: string) {
  const matches = yield* Stream.runCollect(
    workers.listDomains.items({ accountId, hostname: APEX }),
  );
  requireCondition(matches.length === 1, "Expected exactly one apex binding.");
  const domain = matches[0];
  requireCondition(
    domain.hostname === APEX &&
      domain.service === PROD_WORKER &&
      domain.environment === "production" &&
      domain.zoneName === APEX,
    "Apex owner changed; stop recovery.",
  );
  const attachments = yield* Stream.runCollect(
    workers.listDomains.items({ accountId, service: PROD_WORKER }),
  );
  requireCondition(
    attachments.length === 1 && attachments[0].id === domain.id,
    "Exact site Worker has another domain; preserve it and stop.",
  );
  const visibleZones = yield* Stream.runCollect(
    zones.listZones.items({ account: { id: accountId } }),
  );
  requireCondition(
    visibleZones.every((zone) => zone.account.id === accountId) &&
      visibleZones.some(
        (zone) => zone.id === domain.zoneId && zone.name === APEX && zone.status === "active",
      ),
    "Cannot inspect the serving account/zone's production route inventory.",
  );
  for (const zone of visibleZones) {
    const routes = yield* Stream.runCollect(workers.listRoutes.items({ zoneId: zone.id }));
    requireCondition(
      !routes.some((route) => route.script === PROD_WORKER),
      "Exact site Worker has a zone route; review its preservation before recovery.",
    );
  }
  const settings = yield* workers.getScriptScriptAndVersionSetting({
    accountId,
    scriptName: PROD_WORKER,
  });
  const tags = settings.tags ?? [];
  requireCondition(
    tags.includes(`alchemy:stack:${PROD_STACK}`) && tags.includes("alchemy:stage:prod"),
    "Exact owner has foreign stack/stage tags.",
  );
  const logical = tags.filter((tag) => tag.startsWith("alchemy:id:"));
  requireCondition(
    logical.length === 1 && ["alchemy:id:Worker", "alchemy:id:website"].includes(logical[0]),
    "Unexpected owner logical identity.",
  );
  assertStaticBindings(settings.bindings);
  requireCondition(
    !settings.migrations && !settings.tailConsumers?.length && staticExports(settings.exports),
    "Unexpected runtime resources require separate review.",
  );
  const live = (yield* workers.listScriptDeployments({ accountId, scriptName: PROD_WORKER }))
    .deployments[0];
  requireCondition(
    live &&
      live.strategy === "percentage" &&
      live.versions.length > 0 &&
      new Set(live.versions.map((version) => version.versionId)).size === live.versions.length &&
      live.versions.every((version) => version.percentage > 0 && version.percentage <= 100) &&
      Math.abs(live.versions.reduce((sum, version) => sum + version.percentage, 0) - 100) < 0.00001,
    "Current deployment traffic is ambiguous.",
  );
  const deployable =
    (yield* workers.listScriptVersions({ accountId, scriptName: PROD_WORKER, deployable: true }))
      .items ?? [];
  const versions: OwnerSnapshot["versions"] = [];
  for (const version of live.versions) {
    requireCondition(
      deployable.some((item) => item.id === version.versionId),
      "Current version cannot be used as a rollback target.",
    );
    const detail = yield* workers.getScriptVersion({
      accountId,
      scriptName: PROD_WORKER,
      versionId: version.versionId,
    });
    requireCondition(
      detail.id === version.versionId && detail.metadata?.createdOn,
      "Missing exact version metadata.",
    );
    assertStaticBindings(detail.resources.bindings);
    const runtime = detail.resources.scriptRuntime;
    requireCondition(
      !runtime?.containers?.length && staticExports(runtime?.exports) && !runtime?.migrationTag,
      "Rollback does not cover runtime migrations.",
    );
    versions.push({
      id: version.versionId,
      number: detail.number ?? null,
      createdOn: detail.metadata.createdOn ?? null,
      etag: detail.resources.script?.etag ?? null,
      migrationTag: runtime?.migrationTag ?? null,
    });
  }
  return {
    accountId,
    worker: PROD_WORKER,
    domain: {
      id: domain.id,
      hostname: domain.hostname,
      service: domain.service,
      environment: domain.environment,
      zoneId: domain.zoneId,
      zoneName: domain.zoneName,
    },
    logicalTag: logical[0],
    deployment: {
      id: live.id,
      createdOn: live.createdOn,
      strategy: live.strategy,
      versions: live.versions
        .map((version) => ({ versionId: version.versionId, percentage: version.percentage }))
        .sort((a, b) => a.versionId.localeCompare(b.versionId)),
    },
    versions,
  } satisfies OwnerSnapshot;
});

export function sameOwner(expected: OwnerSnapshot, actual: OwnerSnapshot, includeVersion = true) {
  requireCondition(
    expected.accountId === actual.accountId &&
      expected.worker === PROD_WORKER &&
      actual.worker === PROD_WORKER &&
      JSON.stringify(expected.domain) === JSON.stringify(actual.domain),
    "Reviewed apex identity changed.",
  );
  if (includeVersion)
    requireCondition(
      JSON.stringify(expected) === JSON.stringify(actual),
      "Reviewed owner/version/settings metadata changed.",
    );
}

export const previewAttachments = Effect.fn("site.previewAttachments")(function* (
  accountId: string,
  identity: PreviewIdentity,
  exists: boolean,
) {
  const domains = yield* Stream.runCollect(
    workers.listDomains.items({ accountId, service: identity.worker }),
  );
  requireCondition(
    domains.length === 0,
    "Preview Worker has an external domain; do not detach it.",
  );
  // Native delete trusts saved routes. Also reject live routes visible to the CI credential.
  const visibleZones = yield* Stream.runCollect(
    zones.listZones.items({ account: { id: accountId } }),
  );
  requireCondition(
    visibleZones.every((zone) => zone.account.id === accountId) &&
      visibleZones.some((zone) => zone.name === APEX && zone.status === "active"),
    "Cannot inspect the serving account/zone's preview route inventory.",
  );
  for (const zone of visibleZones) {
    const routes = yield* Stream.runCollect(workers.listRoutes.items({ zoneId: zone.id }));
    requireCondition(
      !routes.some((route) => route.script === identity.worker),
      "Preview Worker has a zone route; stop.",
    );
  }
  const settings = yield* workers
    .getScriptScriptAndVersionSetting({ accountId, scriptName: identity.worker })
    .pipe(Effect.catchTag("WorkerNotFound", () => Effect.succeed(undefined)));
  if (!exists)
    requireCondition(
      settings === undefined,
      "Physical preview exists without authoritative state; adoption is forbidden.",
    );
  else {
    requireCondition(
      settings !== undefined &&
        [
          `alchemy:stack:${identity.stack}`,
          `alchemy:stage:${identity.stage}`,
          "alchemy:id:website",
        ].every((tag) => settings.tags?.includes(tag)),
      "Saved preview and live owner differ.",
    );
    assertStaticBindings(settings.bindings);
    requireCondition(
      !settings.migrations && staticExports(settings.exports) && !settings.tailConsumers?.length,
      "Live preview owns non-static runtime resources; preserve it.",
    );
  }
});

export const rollbackVersion = Effect.fn("site.rollbackVersion")(function* (
  backup: OwnerSnapshot,
  expectedCurrent: string,
) {
  const current = yield* ownerSnapshot(backup.accountId);
  sameOwner(backup, current, false);
  requireCondition(
    current.deployment.id === expectedCurrent,
    "Current deployment differs from the separately approved rollback source.",
  );
  const deployable =
    (yield* workers.listScriptVersions({
      accountId: backup.accountId,
      scriptName: PROD_WORKER,
      deployable: true,
    })).items ?? [];
  for (const version of backup.versions) {
    requireCondition(
      deployable.some((item) => item.id === version.id),
      "Reviewed rollback version is no longer deployable.",
    );
    const live = yield* workers.getScriptVersion({
      accountId: backup.accountId,
      scriptName: PROD_WORKER,
      versionId: version.id,
    });
    requireCondition(
      live.id === version.id &&
        (live.resources.script?.etag ?? null) === version.etag &&
        !live.resources.scriptRuntime?.migrationTag &&
        staticExports(live.resources.scriptRuntime?.exports) &&
        !live.resources.scriptRuntime?.containers?.length,
      "Rollback version/runtime changed.",
    );
    assertStaticBindings(live.resources.bindings);
  }
  yield* workers.createScriptDeployment({
    accountId: backup.accountId,
    scriptName: PROD_WORKER,
    strategy: "percentage",
    versions: backup.deployment.versions,
    annotations: { workersMessage: "Reviewed Fairfield site version rollback from GitHub Actions" },
  });
  const after = yield* ownerSnapshot(backup.accountId);
  sameOwner(backup, after, false);
  requireCondition(
    JSON.stringify(after.deployment.versions) === JSON.stringify(backup.deployment.versions),
    "Rollback traffic did not match the approved target.",
  );
  return after;
});
