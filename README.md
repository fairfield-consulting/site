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

## PR previews

Same-repository PRs to main get a stable workers.dev URL in one bot comment;
fork PRs are skipped. PR code builds without deployment secrets, and trusted main
code publishes only static assets. Merging into main removes that PR's preview;
ordinary close events also request cleanup, but a conflicted PR closed without
merging can retain it because GitHub suppresses that event.

Preview stages reuse
the existing account backend without bootstrap or upgrade. The workflows must
first land on main; existing PRs need another PR event. Same-repository workflow
authors remain trusted.

## Production state

Fresh CI runners do not retain local deployment state. Production needs durable
state so each deployment knows which existing site Worker it manages, instead of
treating the live domain as a new resource.

Authoritative state lives in the Cloudflare account's native Alchemy state store,
behind the `alchemy-state-store` Worker. Cloudflare holds the encrypted state and
its auth/encryption secrets; CI does not use runner files or GitHub artifacts as
its source of deployment state. The backend is account-shared; separate stacks
and stages keep application state apart.
Do not commit `.alchemy/`, state exports, credential files, or secret values.
See [Alchemy's state-store documentation](https://alchemy.run/state-store/).

Use `pnpm run deploy:prod` for normal production deployments. The guard protects
the existing site when deployment identity is uncertain, and serialized writers
prevent competing updates to the same state. Do not bypass it to repair state or
run a local production writer alongside CI.

Use `pnpm dev` for site development. Alchemy's default developer stage is
`dev_$USER`, isolated from `prod` even though the native store is account-shared.
Never use `--stage prod` for local development. Development state is not a
production backup.

### Operator boundaries

Use the existing account-scoped Cloudflare credentials with permission for the
site and native state backend. Native CI authentication uses edge-preview
operations; state access is not a zero-side-effect cloud read. Do not solve a
permission failure by granting account-wide access.

Backend bootstrap and upgrades can affect every app sharing the store. Confirm
compatibility with the installed Alchemy version and those apps before any
backend change; bootstrap can redeploy a mismatched store without `--force`.
Keep backend changes and other production writers paused during deployment.
Use the [supported Cloudflare commands](https://alchemy.run/cli/cloudflare/),
not hand-built state or copied credentials.

Bootstrap, recovery and live apply require separate approval. Before a live
change, confirm the current domain owner and a usable rollback version, including
its assets and bindings. On failure, stop writers and preserve the state backend,
including incomplete records. Do not clear state to force another create, delete
the current owner, or override its domain binding.

[Cloudflare version rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
does not restore Alchemy state or external resources. Reconcile code and
authoritative state before normal deployments resume.
