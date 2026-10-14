import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdtemp, open, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { REPOSITORY, requireCondition, sourceSha, type PullRequest } from "./ci-policy.ts";

export async function github<T>(endpoint: string, method = "GET", body?: unknown): Promise<T> {
  requireCondition(
    endpoint.startsWith(`repos/${REPOSITORY}/`),
    "Cross-repository API access is forbidden.",
  );
  const token = process.env.GH_TOKEN;
  requireCondition(token && !/[\r\n]/.test(token), "Missing Actions token.");
  const response = await fetch(`https://api.github.com/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  requireCondition(response.ok, `GitHub metadata operation failed (${response.status}).`);
  return (await response.json()) as T;
}

export const getPr = (number: number) => github<PullRequest>(`repos/${REPOSITORY}/pulls/${number}`);

export async function requireCurrentMain(sha: string) {
  const branch = await github<{ commit: { sha: string } }>(`repos/${REPOSITORY}/branches/main`);
  requireCondition(
    branch.commit.sha === sourceSha(sha),
    "Main changed; obtain a new review for this source.",
  );
}

export async function output(values: Record<string, string>) {
  const file = process.env.GITHUB_OUTPUT;
  requireCondition(file, "Missing Actions output file.");
  requireCondition(
    Object.entries(values).every(([key, value]) => /^[a-z_]+$/.test(key) && !/[\r\n]/.test(value)),
    "Unsafe Actions output.",
  );
  await appendFile(
    file,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}

export async function summary(value: string) {
  requireCondition(process.env.GITHUB_STEP_SUMMARY, "Missing Actions summary file.");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${value}\n`);
}

export interface WorkflowRun {
  id: number;
  workflow_id: number;
  head_sha: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion: string | null;
  path: string;
  repository: { full_name: string };
}

export interface Artifact {
  id: number;
  name: string;
  digest: string;
  expired: boolean;
  size_in_bytes: number;
  workflow_run: { id: number; repository_id: number; head_repository_id: number; head_sha: string };
}

export async function boundArtifact(
  runId: string,
  name: string,
  workflow: string,
  source: string,
  completed: boolean,
) {
  requireCondition(/^[1-9][0-9]{0,19}$/.test(runId), "Invalid review/build run.");
  const run = await github<WorkflowRun>(`repos/${REPOSITORY}/actions/runs/${runId}`);
  const registered = await github<{ id: number; path: string }>(
    `repos/${REPOSITORY}/actions/workflows/${encodeURIComponent(workflow.split("/").at(-1)!)}`,
  );
  requireCondition(
    run.id.toString() === runId &&
      run.repository.full_name === REPOSITORY &&
      run.workflow_id === registered.id &&
      registered.path === workflow &&
      run.path === workflow &&
      run.head_branch === "main" &&
      run.head_sha === source &&
      run.event === "workflow_dispatch",
    "Wrong run/workflow/source provenance.",
  );
  requireCondition(
    !completed || (run.status === "completed" && run.conclusion === "success"),
    "Review run must have completed successfully.",
  );
  const artifacts = await github<{ total_count: number; artifacts: Artifact[] }>(
    `repos/${REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`,
  );
  requireCondition(artifacts.total_count <= 100, "Ambiguous artifact inventory.");
  const matches = artifacts.artifacts.filter((item) => item.name === name);
  requireCondition(matches.length === 1, "Expected one exact run artifact.");
  const artifact = matches[0];
  requireCondition(
    !artifact.expired &&
      artifact.workflow_run.id.toString() === runId &&
      artifact.workflow_run.head_sha === source &&
      artifact.workflow_run.repository_id === artifact.workflow_run.head_repository_id &&
      /^sha256:[a-f0-9]{64}$/.test(artifact.digest) &&
      artifact.size_in_bytes > 0 &&
      artifact.size_in_bytes <= 250 * 1024 * 1024,
    "Invalid artifact identity/digest/size.",
  );
  return artifact;
}

// Bind/check the compressed bytes before any archive path is materialized.
export async function downloadArtifact(
  artifact: Artifact,
  expected: string,
  destination: string,
  kind: "assets" | "review",
) {
  requireCondition(
    artifact.digest === `sha256:${expected}`,
    "Artifact differs from the reviewed digest.",
  );
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      redirect: "manual",
    },
  );
  const location = response.headers.get("location");
  requireCondition(
    response.status === 302 && location && new URL(location).protocol === "https:",
    "Artifact download unavailable.",
  );
  const archive = await fetch(location);
  requireCondition(
    archive.ok && archive.body && process.env.RUNNER_TEMP,
    "Artifact download failed.",
  );
  const temporary = await mkdtemp(path.join(process.env.RUNNER_TEMP, "site-artifact-"));
  const file = path.join(temporary, "artifact.zip");
  const handle = await open(file, "wx", 0o600);
  try {
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of archive.body) {
      size += chunk.length;
      requireCondition(size <= 250 * 1024 * 1024, "Archive exceeds the static-data limit.");
      hash.update(chunk);
      await handle.writeFile(chunk);
    }
    await handle.close();
    requireCondition(
      hash.digest("hex") === expected,
      "Downloaded archive failed digest verification.",
    );
    try {
      await promisify(execFile)(
        "python3",
        ["scripts/extract-ci-artifact.py", file, destination, kind],
        { maxBuffer: 1024 },
      );
    } catch {
      throw new Error("Artifact rejected; only bounded regular data may cross the build boundary.");
    }
  } finally {
    await handle.close();
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function previewComment(number: number, text: string) {
  const marker = "<!-- fairfield-site-ci-preview -->";
  const comments: { id: number; body: string; user: { login: string; type: string } }[] = [];
  for (let page = 1; ; page++) {
    const batch = await github<typeof comments>(
      `repos/${REPOSITORY}/issues/${number}/comments?per_page=100&page=${page}`,
    );
    comments.push(...batch);
    if (batch.length < 100) break;
    requireCondition(page < 20, "Comment inventory exceeds controller limit.");
  }
  const own = comments.filter(
    (comment) =>
      comment.user.login === "github-actions[bot]" &&
      comment.user.type === "Bot" &&
      comment.body.startsWith(marker),
  );
  requireCondition(own.length <= 1, "Ambiguous controller comment.");
  await github(
    `repos/${REPOSITORY}/issues/${own.length ? `comments/${own[0].id}` : `${number}/comments`}`,
    own.length ? "PATCH" : "POST",
    { body: `${marker}\n${text}` },
  );
}
