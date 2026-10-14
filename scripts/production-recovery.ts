import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Stack as Stacks } from "alchemy/Alchemist";
import { open } from "alchemy/Alchemist/Session";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";

import { staticAssets } from "./ci-assets.ts";
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
  recoveryPlan,
  requireCondition,
  sourceSha,
  trustedContext,
} from "./ci-policy.ts";
import { ciRuntime, runCi } from "./ci-state.ts";
import { isProductionState } from "./production-state.ts";

export type RecoveryOperation = "inspect" | "initialize-build" | "plan" | "apply" | "rollback";
export interface RecoveryRecord {
  repository: string;
  workflow: string;
  source: string;
  run: string;
  operation: RecoveryOperation;
  owner: OwnerSnapshot;
  state: { names: string[]; healthy: boolean } | null;
  assets?: string;
  selection?: { fqn: string; type: string; action: string; providerMode: string }[];
  after?: OwnerSnapshot;
}

export function confirmOperation(
  operation: RecoveryOperation,
  source: string,
  run: string,
  digest: string,
  currentDeployment: string,
  confirmation: string,
) {
  const expected =
    operation === "initialize-build"
      ? `initialize-build ${source}`
      : operation === "apply"
        ? `apply ${run} ${digest}`
        : operation === "rollback"
          ? `rollback ${run} ${digest} ${currentDeployment}`
          : "";
  requireCondition(
    confirmation === expected,
    "Separate explicit operation confirmation is required; copy the documented phrase.",
  );
}

export const productionInventory = Effect.fn("site.productionInventory")(function* (
  accountId: string,
  cold: boolean,
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
  if (cold)
    requireCondition(
      worker === undefined && names.every((fqn) => fqn === "website/Build"),
      "Cold recovery cannot replace existing Worker state.",
    );
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

export async function reviewedRecord(currentSource: string, operation: RecoveryOperation) {
  const runId = process.env.REVIEW_RUN ?? "";
  const digest = process.env.REVIEW_DIGEST ?? "";
  requireCondition(/^[1-9][0-9]{0,19}$/.test(runId), "Invalid reviewed run ID.");
  requireCondition(/^[a-f0-9]{64}$/.test(digest), "An exact reviewed archive digest is required.");
  const run = await github<WorkflowRun>(`repos/${REPOSITORY}/actions/runs/${runId}`);
  const source = operation === "rollback" ? sourceSha(run.head_sha) : currentSource;
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
  const expected =
    operation === "initialize-build"
      ? "inspect"
      : operation === "apply"
        ? "plan"
        : operation === "rollback"
          ? undefined
          : "initialize-build";
  requireCondition(
    expected
      ? record.operation === expected
      : ["inspect", "plan", "apply"].includes(record.operation),
    "Wrong reviewed recovery phase.",
  );
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
    "Recovery is manual CI only.",
  );
  const operation = process.env.RECOVERY_OPERATION ?? "";
  requireCondition(
    ["inspect", "initialize-build", "plan", "apply", "rollback"].includes(operation),
    "Unknown recovery operation.",
  );
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
  const review =
    selected === "inspect" ? undefined : await reviewedRecord(context.source, selected);
  confirmOperation(
    selected,
    context.source,
    process.env.REVIEW_RUN ?? "",
    process.env.REVIEW_DIGEST ?? "",
    process.env.EXPECTED_DEPLOYMENT ?? "",
    process.env.RECOVERY_CONFIRMATION ?? "",
  );
  const assets = ["plan", "apply"].includes(selected)
    ? await staticAssets(path.resolve("dist"))
    : undefined;
  const record = await runCi(
    Effect.gen(function* () {
      const owner = yield* ownerSnapshot(accountId);
      if (review) sameOwner(review.owner, owner, selected !== "rollback");
      const state =
        selected === "rollback"
          ? null
          : yield* productionInventory(
              accountId,
              ["initialize-build", "plan", "apply"].includes(selected),
            );
      const result: RecoveryRecord = { ...context, operation: selected, owner, state };
      if (selected === "inspect") return result;
      requireCondition(review !== undefined, "Missing reviewed recovery metadata.");
      if (selected === "rollback") {
        requireCondition(
          process.env.EXPECTED_DEPLOYMENT,
          "A separately reviewed current deployment ID is required.",
        );
        yield* Effect.promise(() => requireCurrentMain(context.source));
        result.after = yield* rollbackVersion(review.owner, process.env.EXPECTED_DEPLOYMENT);
        return result;
      }
      requireCondition(state !== null, "Missing native state inspection.");
      const initializing = selected === "initialize-build";
      requireCondition(
        initializing || state.names.includes("website/Build"),
        "Separately initialize native website/Build before adoption planning.",
      );
      const plan = yield* Stacks.plan({
        target: { entrypoint: "alchemy.run.ts", stage: "prod" },
        operation: "deploy",
        include: [initializing ? "website/Build" : "website"],
        dev: false,
        adopt: !initializing,
        updateStateStore: false,
      });
      requireCondition(
        plan.stack.name === PROD_STACK && plan.stack.stage === "prod",
        "Wrong native production namespace.",
      );
      const selection = recoveryPlan(
        plan.native,
        initializing ? "initialize-build" : "plan",
        accountId,
      );
      result.selection = selection;
      if (assets) result.assets = assets.digest;
      if (selected === "plan") return result;
      if (selected === "apply")
        requireCondition(
          review.assets === result.assets &&
            JSON.stringify(review.selection) === JSON.stringify(selection),
          "Fresh native plan/build differs from the reviewed plan.",
        );
      yield* Effect.promise(() => requireCurrentMain(context.source));
      sameOwner(owner, yield* ownerSnapshot(accountId));
      yield* productionInventory(accountId, true);
      yield* Stacks.apply(plan);
      result.state = yield* productionInventory(accountId, false);
      const after = yield* ownerSnapshot(accountId);
      result.after = after;
      sameOwner(owner, after, initializing);
      if (selected === "apply")
        requireCondition(
          result.state.healthy && after.logicalTag === "alchemy:id:website",
          "Migration did not create healthy exact-owner production state.",
        );
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
