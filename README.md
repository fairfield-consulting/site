# fairfieldconsulting.llc

> Website for Fairfield Consulting LLC built with [Astro](https://astro.build).

## 🧞 Commands

Use Node 24 (see `.nvmrc`) and pnpm 12.11.2 (see `package.json`).
Alchemy requires Node 24.11.1 or newer for its TypeScript module loader.
Install the native pnpm 12 executable using the
[pnpm installation guide](https://pnpm.io/installation). Older Corepack shims do not
support its package layout.

Run all commands from the root of the project:

| Command                          | Action                                                     |
| :------------------------------- | :--------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Installs locked dependencies                               |
| `pnpm dev`                       | Starts the Astro dev server at `localhost:3000`            |
| `pnpm build`                     | Builds the production site to `./dist/`                    |
| `pnpm preview`                   | Previews the production build locally                      |
| `pnpm astro ...`                 | Runs Astro CLI commands                                    |
| `pnpm alchemy ...`               | Runs the Alchemy CLI with Node                             |
| `pnpm alchemy dev`               | Serves the local Cloudflare Worker at `localhost:1337`     |
| `pnpm run deploy`                | Deploys with Alchemy; requires Cloudflare credentials      |
| `pnpm run destroy`               | Removes the Alchemy stack; requires Cloudflare credentials |

Site development uses Astro directly. Alchemy development runs the local Worker
without a production deployment. The Alchemy CLI always runs with Node.

Alchemy uses local state in `.alchemy/`, as before. Preserve this directory
between deployments. The stack name, `website` resource ID, and production domain
`fairfieldconsulting.llc` are unchanged. Alchemy migrates the former
`website/Worker` state row to `website` and keeps its resource identity.
