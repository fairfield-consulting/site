import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { open } from "alchemy/Alchemist/Session";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";

import {
  cloudApi,
  ownerSnapshot,
  rollbackVersion,
  sameOwner,
  type OwnerSnapshot,
} from "./ci-cloudflare.ts";
import {
  boundArtifact,
  github,
  output,
  requireCurrentMain,
  summary,
  downloadArtifact,
  type WorkflowRun,
} from "./ci-github.ts";
import {
  PROD_STACK,
  PROD_WORKER,
  RECOVERY_WORKFLOW,
  REPOSITORY,
  isEntrypoint,
  requireCondition,
  sourceSha,
  trustedContext,
} from "./ci-policy.ts";
import { ciRuntime, runCi } from "./ci-state.ts";
import { isProductionState } from "./production-state.ts";

export type RecoveryOperation = "inspect" | "rollback";
export interface RecoveryRecord {
  repository: string;
  workflow: string;
  source: string;
  run: string;
  operation: RecoveryOperation;
  owner: OwnerSnapshot;
  state: { names: string[]; healthy: boolean } | null;
  after?: OwnerSnapshot;
}

export function confirmOperation(
  operation: RecoveryOperation,
  run: string,
  digest: string,
  currentDeployment: string,
  confirmation: string,
) {
  const expected = operation === "rollback" ? `rollback ${run} ${digest} ${currentDeployment}` : "";
  requireCondition(
    confirmation === expected,
    "Separate explicit operation confirmation is required; copy the documented phrase.",
  );
}

export const productionInventory = Effect.fn("site.productionInventory")(function* (
  accountId: string,
) {
  const session = yield* open(
    { entrypoint: "alchemy.run.ts", stage: "prod" },
    { dev: false, adopt: false, updateStateStore: false },
  );
  const store = yield* Effect.flatten(State.State).pipe(Effect.provide(session.context));
  requireCondition(
    (yield* store.getVersion()) === 7,
    "Existing protocol-7 state is required; do not bootstrap from app CI.",
  );
  const address = { stack: PROD_STACK, stage: "prod" };
  const names = [...(yield* store.list(address))].sort();
  requireCondition(
    (yield* store.getReplacedResources(address)).length === 0,
    "Production replacement cleanup requires separate recovery review.",
  );
  requireCondition(
    names.every((fqn) => ["website/Build", "website"].includes(fqn)),
    "Unexpected production inventory; preserve it and stop.",
  );
  const worker = yield* store.get({ ...address, fqn: "website" });
  const healthy = isProductionState(worker, accountId);
  const build = yield* store.get({ ...address, fqn: "website/Build" });
  if (build) {
    requireCondition(
      build.kind !== "action" &&
        ["created", "updated"].includes(build.status) &&
        !("old" in build) &&
        build.resourceType === "Command.Build" &&
        build.fqn === "website/Build" &&
        build.logicalId === "Build" &&
        build.props?.command === "pnpm run build" &&
        build.props?.outdir === "dist" &&
        build.props?.cwd === undefined &&
        build.attr?.outdir === "dist",
      "Saved Build is not the expected healthy native site build.",
    );
  }
  return { names, healthy };
});

export async function reviewedRecord() {
  const runId = process.env.REVIEW_RUN ?? "";
  const digest = process.env.REVIEW_DIGEST ?? "";
  requireCondition(/^[1-9][0-9]{0,19}$/.test(runId), "Invalid reviewed run ID.");
  requireCondition(/^[a-f0-9]{64}$/.test(digest), "An exact reviewed archive digest is required.");
  const run = await github<WorkflowRun>(`repos/${REPOSITORY}/actions/runs/${runId}`);
  const source = sourceSha(run.head_sha);
  const artifact = await boundArtifact(
    runId,
    "site-recovery-review",
    RECOVERY_WORKFLOW,
    source,
    true,
  );
  const directory = path.join(process.env.RUNNER_TEMP ?? "", "reviewed-recovery");
  await downloadArtifact(artifact, digest, directory, "review");
  const file = path.join(directory, "review.json");
  const bytes = await readFile(file);
  requireCondition(bytes.length < 64 * 1024, "Unexpected recovery metadata size.");
  const record: RecoveryRecord = JSON.parse(bytes.toString());
  requireCondition(
    record.repository === REPOSITORY &&
      record.workflow === RECOVERY_WORKFLOW &&
      record.source === source &&
      record.run === runId,
    "Review artifact metadata/provenance differ.",
  );
  requireCondition(record.operation === "inspect", "Rollback requires a reviewed inspection.");
  requireCondition(
    record.owner.worker === PROD_WORKER && record.owner.versions.length > 0,
    "Missing exact-owner recovery material.",
  );
  return record;
}

export async function recoverProduction() {
  const context = trustedContext(RECOVERY_WORKFLOW);
  requireCondition(
    process.env.GITHUB_EVENT_NAME === "workflow_dispatch",
    "Production inspection/rollback is manual CI only.",
  );
  const operation = process.env.RECOVERY_OPERATION ?? "";
  requireCondition(["inspect", "rollback"].includes(operation), "Unknown production operation.");
  const selected = operation as RecoveryOperation;
  requireCondition(
    sourceSha(process.env.RECOVERY_SOURCE ?? "") === context.source,
    "Dispatch the exact reviewed main source.",
  );
  await requireCurrentMain(context.source);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  requireCondition(
    /^[a-f0-9]{32}$/.test(accountId) && process.env.CLOUDFLARE_API_TOKEN,
    "Expected scoped CI Cloudflare credentials.",
  );
  const review = selected === "inspect" ? undefined : await reviewedRecord();
  confirmOperation(
    selected,
    process.env.REVIEW_RUN ?? "",
    process.env.REVIEW_DIGEST ?? "",
    process.env.EXPECTED_DEPLOYMENT ?? "",
    process.env.RECOVERY_CONFIRMATION ?? "",
  );
  const record = await runCi(
    Effect.gen(function* () {
      const owner = yield* ownerSnapshot(accountId);
      const state = selected === "rollback" ? null : yield* productionInventory(accountId);
      const result: RecoveryRecord = { ...context, operation: selected, owner, state };
      if (selected === "inspect") return result;
      requireCondition(review !== undefined, "Missing reviewed inspection metadata.");
      sameOwner(review.owner, owner, false);
      requireCondition(
        process.env.EXPECTED_DEPLOYMENT,
        "A separately reviewed current deployment ID is required.",
      );
      yield* Effect.promise(() => requireCurrentMain(context.source));
      result.after = yield* rollbackVersion(review.owner, process.env.EXPECTED_DEPLOYMENT);
      return result;
    }).pipe(Effect.provide(cloudApi), Effect.provide(ciRuntime), Effect.scoped),
  );
  const directory = path.join(process.env.RUNNER_TEMP ?? "", "site-recovery-review");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "review.json"), `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  });
  await output({ review_directory: directory });
  await summary(
    `${selected}: ${PROD_WORKER} · source ${context.source}. Review artifact contains identity/version metadata only, not a state backup. No backend bootstrap or update is permitted.`,
  );
}

if (isEntrypoint(import.meta.url)) {
  try {
    await recoverProduction();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Recovery stopped. Preserve state.");
    process.exitCode = 1;
  }
}
