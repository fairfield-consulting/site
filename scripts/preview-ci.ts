import { mkdir } from "node:fs/promises";
import path from "node:path";

import { Stack as Stacks } from "alchemy/Alchemist";
import { open } from "alchemy/Alchemist/Session";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";

import { staticAssets } from "./ci-assets.ts";
import { cloudApi, previewAttachments } from "./ci-cloudflare.ts";
import { boundArtifact, downloadArtifact, getPr, previewComment, summary } from "./ci-github.ts";
import {
  PREVIEW_WORKFLOW,
  assertPreviewRow,
  isEntrypoint,
  previewIdentity,
  previewPlan,
  requireCondition,
  sourceSha,
  trustedContext,
  validatePr,
  type PreviewIdentity,
} from "./ci-policy.ts";
import { ciRuntime, runCi } from "./ci-state.ts";

export const previewInventory = Effect.fn("site.previewInventory")(function* (
  identity: PreviewIdentity,
  accountId: string,
) {
  const session = yield* open(
    { entrypoint: "alchemy.preview.ts", stage: identity.stage },
    { dev: false, adopt: false, updateStateStore: false },
  );
  const store = yield* Effect.flatten(State.State).pipe(Effect.provide(session.context));
  requireCondition((yield* store.getVersion()) === 7, "Expected the existing protocol-7 backend.");
  const address = { stack: identity.stack, stage: identity.stage };
  const names = yield* store.list(address);
  requireCondition(
    names.length === 0 || (names.length === 1 && names[0] === "website"),
    "Cleanup/deploy requires the complete exact preview inventory.",
  );
  requireCondition(
    (yield* store.getReplacedResources(address)).length === 0,
    "Preview has replacement cleanup pending.",
  );
  for (const fqn of names) {
    const row = yield* store.get({ ...address, fqn });
    requireCondition(row !== undefined, "Preview inventory changed.");
    assertPreviewRow(row, identity, accountId);
  }
  const savedOutput = yield* store.getOutput(address);
  if (savedOutput !== undefined)
    requireCondition(isPreviewOutput(savedOutput, identity), "Unsafe saved preview output.");
  yield* previewAttachments(accountId, identity, names.length === 1);
  return { exists: names.length === 1, hasOutput: savedOutput !== undefined };
});

export function isPreviewOutput(
  value: unknown,
  identity: PreviewIdentity,
): value is { url: string } {
  if (!value || typeof value !== "object" || Object.keys(value).join() !== "url") return false;
  if (!("url" in value)) return false;
  const url = value.url;
  return (
    typeof url === "string" &&
    new RegExp(`^https://${identity.worker}\\.[a-z0-9-]+\\.workers\\.dev/?$`).test(url)
  );
}

const cleanup = Effect.fn("site.cleanupPreview")(function* (
  identity: PreviewIdentity,
  accountId: string,
) {
  const inventory = yield* previewInventory(identity, accountId);
  if (!inventory.exists && !inventory.hasOutput) return;
  const plan = yield* Stacks.plan({
    target: { entrypoint: "alchemy.preview.ts", stage: identity.stage },
    operation: "destroy",
    dev: false,
    adopt: false,
    updateStateStore: false,
  });
  if (inventory.exists) previewPlan(plan.native, identity, accountId, true);
  else
    requireCondition(
      plan.native.destroy &&
        Object.keys(plan.native.deletions).length === 0 &&
        Object.keys(plan.native.resources).length === 0 &&
        Object.keys(plan.native.actions).length === 0 &&
        Object.keys(plan.native.actionDeletions).length === 0,
      "Unexpected output-only cleanup.",
    );
  const current = validatePr(
    yield* Effect.promise(() => getPr(identity.number)),
    String(identity.number),
  );
  requireCondition(current.state === "closed", "PR reopened; do not clean it up.");
  yield* previewInventory(identity, accountId);
  yield* Stacks.apply(plan);
});

export async function controlPreview() {
  const context = trustedContext(PREVIEW_WORKFLOW);
  const identity = previewIdentity(process.env.PREVIEW_PR ?? "");
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  requireCondition(
    /^[a-f0-9]{32}$/.test(accountId) && process.env.CLOUDFLARE_API_TOKEN,
    "Expected scoped CI Cloudflare credentials.",
  );
  requireCondition(
    ["workflow_dispatch", "pull_request_target"].includes(process.env.GITHUB_EVENT_NAME ?? ""),
    "Unsupported cloud controller event.",
  );
  const first = validatePr(await getPr(identity.number), String(identity.number));
  const directory = path.join(process.env.RUNNER_TEMP ?? "", `site-preview-${identity.number}`);
  requireCondition(
    process.env.RUNNER_TEMP && path.isAbsolute(directory),
    "Missing dedicated runner data directory.",
  );
  await mkdir(directory, { recursive: true });
  process.env.PREVIEW_ASSETS_DIRECTORY = directory;
  let built = false;
  const head = process.env.PREVIEW_HEAD ?? "";
  if (first.state === "open") {
    // An old close event must not delete a reopened PR or deploy without a new build.
    if (process.env.GITHUB_EVENT_NAME === "pull_request_target") return;
    sourceSha(head);
    requireCondition(first.sha === head, "Stale preview build; dispatch its current head.");
    const artifact = await boundArtifact(
      context.run,
      `site-preview-${identity.number}-${head}`,
      PREVIEW_WORKFLOW,
      context.source,
      false,
    );
    requireCondition(
      artifact.id.toString() === process.env.PREVIEW_ARTIFACT_ID,
      "Wrong build artifact ID.",
    );
    await downloadArtifact(
      artifact,
      process.env.PREVIEW_ARTIFACT_DIGEST ?? "",
      directory,
      "assets",
    );
    await staticAssets(directory);
    built = true;
  }
  const result = await runCi(
    Effect.gen(function* () {
      const current = validatePr(
        yield* Effect.promise(() => getPr(identity.number)),
        String(identity.number),
      );
      if (current.state === "closed") {
        yield* cleanup(identity, accountId);
        return { removed: true };
      }
      requireCondition(
        built && current.sha === head,
        "Preview source changed; do not deploy stale data.",
      );
      yield* previewInventory(identity, accountId);
      const plan = yield* Stacks.plan({
        target: { entrypoint: "alchemy.preview.ts", stage: identity.stage },
        operation: "deploy",
        dev: false,
        adopt: false,
        updateStateStore: false,
      });
      previewPlan(plan.native, identity, accountId, false);
      const latest = validatePr(
        yield* Effect.promise(() => getPr(identity.number)),
        String(identity.number),
      );
      if (latest.state === "closed") {
        yield* cleanup(identity, accountId);
        return { removed: true };
      }
      requireCondition(latest.sha === head, "Head changed before preview apply.");
      yield* previewInventory(identity, accountId);
      const deployed = yield* Stacks.apply(plan).pipe(
        Effect.map((value: unknown) => {
          requireCondition(
            isPreviewOutput(value, identity),
            "Native deployment did not return the expected workers.dev URL.",
          );
          return value;
        }),
      );
      const after = validatePr(
        yield* Effect.promise(() => getPr(identity.number)),
        String(identity.number),
      );
      if (after.state === "closed") {
        yield* cleanup(identity, accountId);
        return { removed: true };
      }
      requireCondition(after.sha === head, "Head changed during deploy; preview result is stale.");
      return { removed: false, url: deployed.url };
    }).pipe(Effect.provide(cloudApi), Effect.provide(ciRuntime), Effect.scoped),
  );
  const message = result.removed
    ? "Preview removed: PR is closed."
    : `Preview: ${result.url} · built ${head.slice(0, 7)}. Static assets only; not production.`;
  await previewComment(identity.number, message);
  await summary(message);
}

if (isEntrypoint(import.meta.url)) {
  try {
    await controlPreview();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Preview controller stopped.");
    process.exitCode = 1;
  }
}
