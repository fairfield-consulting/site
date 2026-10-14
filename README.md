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

## Production state

The stack uses Alchemy's native [`Cloudflare.state()`](https://alchemy.run/state-store/):
an encrypted Durable Object SQLite store behind the account's `alchemy-state-store`
Worker. Alchemy keeps its token and encryption key in Cloudflare Secrets Store.
`ALCHEMY_STATE_TOKEN` and `ALCHEMY_PASSWORD` do not select or configure this backend.
Do not commit `.alchemy/`, state exports, credential files, or secret values.

The stack remains `fairfield-consulting`, stage `prod`, with apex
`fairfieldconsulting.llc`. Production pins the physical Worker name to
`fairfield-consulting-worker-prod-5hd5v3cmaxxxlw4w`, the confirmed apex owner.
Two other Workers carry the same old ownership tags; tags, creation date, and list
order cannot select the recovery target. Leave those Workers untouched.

Routine production deployment is `pnpm run deploy:prod`. Its guard reads only
`fairfield-consulting/prod/website` from the Cloudflare backend. It requires healthy
state, the exact Worker, the configured account, the apex, and the upgraded
stack/stage/`website` ownership tags. The guard reads the native state object
directly, never prints it, and sends native auth progress to stderr.
Missing, old-only, incomplete, or mismatched state stops deployment. Main pushes
use this guard, never bootstrap or `--adopt`. CI writers share one concurrency
group; do not run a second local or CI production writer at the same time.

The backend is shared, but native keys isolate stack, stage, and resource FQN.
Alchemy beta.83 requires state-store protocol version 7. Before bootstrap or
apply, verify compatibility with any apps that share this backend. Bootstrap
can redeploy a mismatched store even without `--force`; never use it to downgrade
another app's backend. The CI preflight disables prompts, adoption, and automatic
backend updates, and uses a fresh temporary runtime directory so it cannot
resume an old local bootstrap. It fails on a version mismatch. Keep backend
upgrades and other production writers paused through
preflight and apply.

Use `pnpm dev` for site development. Alchemy's default developer stage is
`dev_$USER`, isolated from `prod` even though the native store is account-shared.
Never use `--stage prod` for local development. `pnpm run deploy` is the direct
operator command, not the routine production path.

### Controlled first recovery

These steps require separate cloud-provisioning and production-apply approval.
Merging this code does not approve them. No trusted production snapshot is
available; the dev snapshot is not production recovery state.

1. Pause production writers and the main deployment workflow before merging the
   package-manager, Alchemy upgrade, and recovery changes in that order.
   Reconfirm that the apex binding still names the exact Worker above, in
   `production`. Record its then-current deployment/version ID
   and verify that the old version and its assets remain available for rollback.
   Keep recovery records and any sensitive backups in approved secure storage,
   outside Git and CI logs. Do not invent an instance ID or copy dev state.
2. Confirm the account's Workers, Durable Objects, Secrets Store, and
   `workers.dev` prerequisites. The existing `CLOUDFLARE_API_TOKEN` must have the
   account-scoped Worker/asset and Secrets Store permissions needed by native
   bootstrap, edge-preview authentication, and deployment, plus permission to
   reconcile the existing custom domain. Keep `CLOUDFLARE_ACCOUNT_ID` pointed at
   the owner's account. CI uses those existing GitHub secret keys and retains
   `CLOUDFLARE_EMAIL` for the existing credential setup. Do not mint a broad token
   or change auth as part of this PR. Effective permissions are not verified here.
3. After bootstrap approval, use the supported native command with the existing
   credential loader: `pnpm alchemy provider cloudflare bootstrap --env-file .env`.
   It creates/repairs the shared backend and its Secrets Store secrets. Do not use
   `--force`, teardown, or manual state JSON. Bootstrap does not recover the site.
   Native CI access sets `CI=true` and resolves state-store credentials through a
   short-lived edge-preview session; this is not an account-wide read-only API.
4. After separate production-state initialization approval, review
   `CI=true pnpm alchemy plan --stage prod --include website/Build --env-file .env`.
   It must select only the build row/dependencies, not the site Worker. Then run
   `CI=true pnpm alchemy deploy --stage prod --include website/Build --yes --env-file .env`.
   This is a state-changing native targeted apply, not a read-only operation.
   It initializes the build row and preserves excluded resources and outputs.
   A cold StaticSite plan otherwise has unresolved build outputs and can defer
   the exact-Worker adoption probe until apply. Do not proceed on an unexpected
   selection; a resource named Build is not automatically safe.
5. Review a one-time recovery plan:
   `CI=true pnpm alchemy plan --stage prod --adopt --env-file .env`.
   Alchemy beta.83 flattened `website/Worker` to `website`. The live owner still
   has `alchemy:id:Worker`; the new provider expects `alchemy:id:website`.
   `renamedFrom` cannot recover a missing state row. Thus exact-name cold recovery
   needs this explicit adoption flag; it is not silent cross-logical-ID adoption.
   Check that only the exact named owner is adopted/updated, with the same apex.
   Stop on a site create, replacement, deletion, or unexpected resource/domain.
   Alchemy generates the new adoption record itself; it does not restore the lost
   random instance ID. A plan does not persist that record.
6. Obtain separate approval for the reviewed first apply and a maintenance window:
   `CI=true pnpm alchemy deploy --stage prod --adopt --yes --env-file .env`.
   Adoption forces an update and can upload code/assets to the live Worker. It is
   not a metadata-only import; brief downtime is possible. Do not detach/reassign
   the apex, enable `override_existing_origin`, or delete any Worker.
7. Run `pnpm run state:check:prod` with the existing account environment, then
   repeat from a fresh runner with `CI=true`. Confirm the same healthy remote
   identity, apex binding, and rendered site before resuming routine deployments.
   Native state-store credentials must remain accessible to fresh CI. Do not
   save credentials or state in GitHub artifacts to replace the native backend.

### Rollback

Keep production writers paused if first apply or verification fails. Retain the
remote state and backend, including incomplete lifecycle records; do not clear
them to force another create. Inspect only the relevant identity/status safely.
With separate rollback approval, use Cloudflare's
[version rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
on the same exact Worker to restore the recorded version. Confirm its assets and
bindings are compatible: version rollback does not restore changed external
resources. Keep the apex bound to that Worker. Reconcile code and native state
before resuming CI; the old main CLI and unmodified #46 still use local state and
are not a safe fallback deployment path.

If exact-name adoption cannot be reviewed safely, stop. A replacement and
controlled domain handoff is a separately designed and authorized migration,
not an automatic fallback. No deletion or override is part of this recovery.
