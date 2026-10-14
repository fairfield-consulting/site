# fairfieldconsulting.llc

> Website for Fairfield Consulting LLC built with [Astro](https://astro.build).

## 🧞 Commands

Use Node 24 (see `.nvmrc`) and pnpm 12.11.2 (see `package.json`).
Alchemy requires at least Node 24.11.1 on the Node 24 line for its TypeScript loader.
Install the native pnpm 12 executable using the
[pnpm installation guide](https://pnpm.io/installation). Older Corepack shims do not
support its package layout.

Run all commands from the root of the project:

| Command                          | Action                                                       |
| :------------------------------- | :----------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Installs locked dependencies                                 |
| `pnpm dev`                       | Starts the Astro dev server at `localhost:3000`              |
| `pnpm build`                     | Builds the production site to `./dist/`                      |
| `pnpm preview`                   | Previews the production build locally                        |
| `pnpm astro ...`                 | Runs Astro CLI commands                                      |
| `pnpm alchemy ...`               | Runs the Alchemy CLI with Node                               |
| `pnpm alchemy dev`               | Serves the local Cloudflare Worker at `localhost:1337`       |
| `pnpm run deploy`                | Deploys with Alchemy; requires Cloudflare credentials        |
| `pnpm run deploy:prod`           | Deploys production only after the durable-state guard passes |
| `pnpm run state:check:prod`      | Checks production state identity without printing state      |
| `pnpm run destroy`               | Removes the Alchemy stack; requires Cloudflare credentials   |

Site development uses Astro directly. Alchemy development runs the local Worker
without a production deployment. The Alchemy CLI always runs with Node.

## CI previews and production state

Fresh CI runners do not retain local deployment state. Durable state tells each
deployment which existing Worker it manages, instead of treating the live domain
as a new resource.

Authoritative state lives in the Cloudflare account's native Alchemy state store,
behind `alchemy-state-store`. CI reuses its protocol-7 backend; app workflows
cannot bootstrap or upgrade it. Cloudflare holds the encrypted state and its
auth/encryption secrets, not runner files or GitHub artifacts. Separate stacks and
stages keep resource identities apart, but **the backend and its credentials are
account-shared**. Check every consumer before a separately approved backend change.
See [Alchemy's state-store documentation](https://alchemy.run/state-store/).
Never commit state, credential files or secret values.

Normal production deployment belongs to **Deploy Application** on main. Its guard
stops deployment when the saved apex-owner identity is uncertain. Production and
recovery share one writer queue; do not run competing local writers or bypass the
guard. Use `pnpm dev` locally. Alchemy's developer stage is separate from `prod`;
development state is not a production backup.

**Site PR preview** builds a selected same-repository PR without deployment
secrets, then deploys static data through trusted main infrastructure. Each PR has
a stable workers.dev URL and its own state/Worker; closing it removes only that
preview. Previews never claim the apex, a subdomain or a zone route. Dispatch again
to preview an updated head. Fork and Dependabot PRs cannot deploy.

This separation protects PR app/build execution, **not repository secrets from a
workflow author**. Contributors who can change same-repository workflows are
trusted deployment operators. If that is not acceptable, do not merge until
separately approved, verified secret and workflow protection is in place; an
environment name alone is not protection.

### Actions rollout

The workflows must first be merged/registered on main. That does not automatically
build an already-open PR. No cloud preview or recovery has run merely because this
pipeline exists.

1. With approval, run **Site PR preview** on main with the UI PR number. Review its
   returned URL, exact built SHA, mobile/desktop layout, keyboard focus and assets
   before any production or UI merge.
2. Obtain separate production recovery approval. Run **Site production recovery →
   inspect** with the current main SHA. Review the exact apex owner, version traffic,
   permissions and state health. Retain the inspection artifact and its digest
   beyond Actions retention; it records rollback references, **not a state backup**.
3. Separately approve **initialize-build** using that inspection run/digest. This
   executes the native Build and writes state; it does not upload the site.
4. Run **plan** using the successful initialization run/digest. Review the native
   exact-owner adoption selection and build digest. This does not apply the plan.
5. Separately approve **apply** with that plan run/digest and the same unchanged
   main SHA. It rechecks the live owner/version and native plan before upload;
   changed source, state, bindings or owner stops the operation. Brief downtime
   remains a rollout risk.
6. Run **Deploy Application** on main to verify an independent fresh runner uses
   migrated state and the normal no-adoption path. Review the rendered site before
   separately approving the UI PR merge.

Write operations require these exact confirmation phrases; other operations leave
confirmation empty:

| Operation          | Confirmation                                                  |
| ------------------ | ------------------------------------------------------------- |
| `initialize-build` | `initialize-build <source_sha>`                               |
| `apply`            | `apply <review_run> <review_digest>`                          |
| `rollback`         | `rollback <review_run> <review_digest> <expected_deployment>` |

### Permissions and rollback

The existing `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and, when applicable,
`CLOUDFLARE_EMAIL` secrets must already authorize the exact site, backend credential
access, domain inspection and visible-zone route inspection. Native state
authentication uses temporary edge-preview operations; inspection is not a
zero-side-effect cloud read. Missing/incompatible backend or permissions stops CI.
Do not add global-admin credentials or force-bootstrap to make it pass.
See [Alchemy's Cloudflare CI guide](https://alchemy.run/environments/ci/#cloudflare).

Before live recovery, confirm the retained versions are deployable with usable
assets/bindings. No workflow deletes the existing apex owner or overrides its
binding. Independent repos retain their own exact host/path and Worker ownership;
no wildcard or whole-zone takeover belongs in app CI.

On failure, stop writers and preserve authoritative state, including incomplete
records. **rollback** uses a reviewed inspection/plan/apply artifact, its exact
Worker versions and a separately reviewed current deployment ID. It changes only
version traffic, not domains, routes, secrets, backend or Alchemy state. API refusal
has no force fallback. Verify the site afterward and review source/state before
resuming normal deployment; a later main deployment can replace the rollback.
See [Cloudflare rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
