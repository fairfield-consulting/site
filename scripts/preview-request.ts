import { readFile } from "node:fs/promises";

import { getPr, output } from "./ci-github.ts";
import {
  PREVIEW_WORKFLOW,
  isEntrypoint,
  previewIdentity,
  requireCondition,
  trustedContext,
  validatePr,
} from "./ci-policy.ts";

export async function previewRequest() {
  trustedContext(PREVIEW_WORKFLOW);
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH ?? "", "utf8"));
  let number: string;
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch")
    number = String(event.inputs?.pr ?? "");
  else {
    requireCondition(
      process.env.GITHUB_EVENT_NAME === "pull_request_target" &&
        event.action === "closed" &&
        event.repository?.full_name === "fairfield-consulting/site",
      "Unsupported preview event.",
    );
    number = String(event.pull_request?.number ?? "");
  }
  const identity = previewIdentity(number);
  const current = validatePr(await getPr(identity.number), number);
  await output({ pr: number, head: current.sha, state: current.state });
}

if (isEntrypoint(import.meta.url)) {
  try {
    await previewRequest();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Preview request stopped.");
    process.exitCode = 1;
  }
}
