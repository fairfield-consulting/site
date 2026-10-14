import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Plan } from "alchemy/Plan";
import type { PersistedState } from "alchemy/State";

export const REPOSITORY = "fairfield-consulting/site";
export const PROD_STACK = "fairfield-consulting";
export const PROD_WORKER = "fairfield-consulting-worker-prod-5hd5v3cmaxxxlw4w";
export const APEX = "fairfieldconsulting.llc";
export const PREVIEW_STACK = "fairfield-consulting-preview";
export const PREVIEW_WORKFLOW = ".github/workflows/preview.yml";
export const RECOVERY_WORKFLOW = ".github/workflows/recover-production.yml";

export class CiPolicyError extends Error {}

export function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CiPolicyError(message);
}

export function isEntrypoint(url: string) {
  return process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === url;
}

export function positiveNumber(value: string) {
  requireCondition(/^[1-9][0-9]{0,8}$/.test(value), "Invalid bounded PR/run number.");
  return Number(value);
}

export function sourceSha(value: string) {
  requireCondition(/^[a-f0-9]{40}$/.test(value), "An exact commit SHA is required.");
  return value;
}

export function previewIdentity(value: string) {
  const number = positiveNumber(value);
  return {
    number,
    stack: PREVIEW_STACK,
    stage: `pr-${number}`,
    worker: `fairfield-consulting-preview-pr-${number}`,
  };
}

export function previewStage(value: string) {
  requireCondition(value.startsWith("pr-"), "Not a preview stage.");
  const identity = previewIdentity(value.slice(3));
  requireCondition(identity.stage === value, "Noncanonical preview stage.");
  return identity;
}

export interface PullRequest {
  number: number;
  state: "open" | "closed";
  user: { login: string };
  base: { ref: string; repo: { full_name: string } };
  head: { sha: string; repo: { full_name: string } | null };
}

export function validatePr(pr: PullRequest, value: string) {
  const identity = previewIdentity(value);
  requireCondition(
    pr.number === identity.number && pr.base.repo.full_name === REPOSITORY,
    "Wrong PR/base repository.",
  );
  requireCondition(
    pr.base.ref === "main" || pr.state === "closed",
    "Only main PRs can deploy; closed PRs may clean up their exact preview.",
  );
  requireCondition(
    pr.head.repo?.full_name === REPOSITORY && pr.user.login !== "dependabot[bot]",
    "Fork/Dependabot previews cannot use deployment credentials.",
  );
  sourceSha(pr.head.sha);
  return { ...identity, sha: pr.head.sha, state: pr.state };
}

export function trustedContext(workflow: string) {
  requireCondition(
    process.env.GITHUB_REPOSITORY === REPOSITORY && process.env.GITHUB_REF === "refs/heads/main",
    "Only this repository's main workflow can control cloud operations.",
  );
  requireCondition(
    process.env.GITHUB_WORKFLOW_REF === `${REPOSITORY}/${workflow}@refs/heads/main`,
    "Wrong controlling workflow.",
  );
  const sha = sourceSha(process.env.GITHUB_SHA ?? "");
  requireCondition(
    process.env.GITHUB_WORKFLOW_SHA === sha,
    "Workflow and infrastructure source differ.",
  );
  const run = process.env.GITHUB_RUN_ID ?? "";
  requireCondition(/^[1-9][0-9]{0,19}$/.test(run), "Invalid workflow run.");
  return { repository: REPOSITORY, workflow, source: sha, run };
}

export function assertPreviewRow(
  row: PersistedState,
  identity: PreviewIdentity,
  accountId: string,
) {
  requireCondition(row.kind !== "action", "Preview inventory contains an action.");
  const value = row;
  const attr = value.attr;
  requireCondition(
    (value.status === "created" || value.status === "updated") &&
      !("old" in value) &&
      value.providerMode !== "local",
    "Preview state is incomplete or replacing.",
  );
  requireCondition(
    value.fqn === "website" &&
      value.logicalId === "website" &&
      value.resourceType === "Cloudflare.Worker",
    "Unexpected preview resource.",
  );
  requireCondition(
    attr?.accountId === accountId &&
      attr.workerName === identity.worker &&
      typeof attr.workerId === "string" &&
      !attr.workerId.startsWith("dev:"),
    "Wrong saved physical preview identity.",
  );
  requireCondition(
    attr.domain === undefined &&
      Array.isArray(attr.routes) &&
      attr.routes.length === 0 &&
      attr.versionOf === undefined &&
      attr.previewOf === undefined &&
      attr.namespace === undefined,
    "Preview state refers to domains/routes/another Worker.",
  );
  requireCondition(
    attr.durableObjectNamespaces &&
      typeof attr.durableObjectNamespaces === "object" &&
      Object.keys(attr.durableObjectNamespaces).length === 0 &&
      Array.isArray(attr.crons) &&
      attr.crons.length === 0 &&
      !attr.tailConsumers?.length &&
      !attr.streamingTailConsumers?.length,
    "Preview state includes non-static runtime resources.",
  );
  requireCondition(
    attr.affinityZoneIds === undefined ||
      (Array.isArray(attr.affinityZoneIds) && attr.affinityZoneIds.length === 0),
    "Preview state includes zone-affinity rules; preserve it and stop.",
  );
  const tags = attr.tags;
  requireCondition(
    Array.isArray(tags) &&
      [
        `alchemy:stack:${PREVIEW_STACK}`,
        `alchemy:stage:${identity.stage}`,
        "alchemy:id:website",
      ].every((tag) => tags.includes(tag)),
    "Wrong preview ownership tags.",
  );
  const props = value.props;
  requireCondition(
    props?.name === identity.worker &&
      props.domain === undefined &&
      props.version === undefined &&
      props.preview === undefined &&
      props.main === undefined &&
      props.script === undefined &&
      props.namespace === undefined &&
      props.env === undefined &&
      props.exports === undefined &&
      props.crons === undefined &&
      props.containers === undefined,
    "Unsafe saved preview configuration.",
  );
  requireCondition(
    (props.routes === undefined || (Array.isArray(props.routes) && props.routes.length === 0)) &&
      Array.isArray(value.bindings) &&
      value.bindings.length === 0,
    "Preview state contains external bindings/routes.",
  );
}

export interface PreviewIdentity {
  number: number;
  stack: string;
  stage: string;
  worker: string;
}

function assertCleanNode(node: Plan["resources"][string]) {
  requireCondition(
    !node.renamedFrom?.length &&
      node.action !== "replace" &&
      node.bindings.every((binding) => binding.action === "noop"),
    "Plan includes rename/replacement/binding changes.",
  );
  const state = node.state;
  requireCondition(
    !state || ((state.status === "created" || state.status === "updated") && !("old" in state)),
    "Plan includes incomplete or replacement state.",
  );
  requireCondition(
    !("deferredAdoption" in node) || node.deferredAdoption === undefined,
    "Unresolved adoption cannot be reviewed.",
  );
}

export function recoveryPlan(
  plan: Plan,
  operation: "initialize-build" | "plan",
  accountId: string,
) {
  const expected =
    operation === "initialize-build" ? ["website/Build"] : ["website", "website/Build"];
  requireCondition(
    !plan.destroy &&
      Object.keys(plan.deletions).length === 0 &&
      Object.keys(plan.actionDeletions).length === 0 &&
      Object.keys(plan.actions).length === 0,
    "Recovery cannot delete or run unrelated actions.",
  );
  requireCondition(
    plan.output === undefined &&
      plan.selectedFqns !== undefined &&
      [...plan.selectedFqns].sort().join() === expected.slice().sort().join(),
    "Recovery must use the exact closed native selection.",
  );
  requireCondition(
    Object.keys(plan.resources).sort().join() === expected.slice().sort().join(),
    "Unexpected recovery resource.",
  );
  return expected.map((fqn) => {
    const node = plan.resources[fqn];
    assertCleanNode(node);
    requireCondition(node.resource.FQN === fqn, "Wrong native resource identity.");
    if (fqn === "website/Build") {
      requireCondition(node.resource.Type === "Command.Build", "Not the native Build resource.");
      requireCondition(
        operation === "initialize-build"
          ? ["create", "noop", "update"].includes(node.action)
          : node.action === "noop",
        "Build must be resolved and unchanged before owner adoption.",
      );
    } else {
      requireCondition(
        node.resource.Type === "Cloudflare.Worker" &&
          node.action === "adopted" &&
          "adopting" in node &&
          node.adopting === true,
        "Expected explicit cold exact-owner adoption, not creation/update.",
      );
      requireCondition(
        node.state?.attr?.workerName === PROD_WORKER &&
          node.state.attr.accountId === accountId &&
          node.state.attr.domain?.name === APEX &&
          node.state.attr.tags?.includes("alchemy:stack:fairfield-consulting") &&
          node.state.attr.tags?.includes("alchemy:stage:prod"),
        "Native ownership probe selected another Worker/account/domain/stage.",
      );
    }
    return {
      fqn,
      type: node.resource.Type,
      action: node.action,
      providerMode: node.mode ?? "live",
    };
  });
}

export function previewPlan(
  plan: Plan,
  identity: PreviewIdentity,
  accountId: string,
  cleanup: boolean,
) {
  requireCondition(
    Object.keys(plan.actions).length === 0 && Object.keys(plan.actionDeletions).length === 0,
    "Unexpected preview actions.",
  );
  if (cleanup) {
    requireCondition(
      plan.destroy === true &&
        Object.keys(plan.resources).length === 0 &&
        Object.keys(plan.deletions).length === 1,
      "Cleanup must destroy exactly one preview resource.",
    );
    const node = plan.deletions.website;
    requireCondition(
      node !== undefined && node.resource.FQN === "website" && node.action === "delete",
      "Wrong preview deletion.",
    );
    assertPreviewRow(node.state, identity, accountId);
  } else {
    requireCondition(
      !plan.destroy &&
        Object.keys(plan.deletions).length === 0 &&
        Object.keys(plan.resources).join() === "website",
      "Preview cannot replace/delete other resources.",
    );
    const node = plan.resources.website;
    assertCleanNode(node);
    requireCondition(
      ["create", "update", "noop"].includes(node.action) &&
        node.resource.Type === "Cloudflare.Worker",
      "Preview adoption/replacement is forbidden.",
    );
    if (node.state) assertPreviewRow(node.state, identity, accountId);
  }
}
