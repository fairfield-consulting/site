# fairfieldconsulting.llc

> Website for Fairfield Consulting LLC built with [Astro](https://astro.build).

## 🧞 Commands

Use Node 22 (see `.nvmrc`) and pnpm 12.11.2 (see `package.json`).
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
| `pnpm run deploy`                | Deploys with Alchemy; requires Cloudflare credentials      |
| `pnpm run destroy`               | Removes the Alchemy stack; requires Cloudflare credentials |

The installed Alchemy CLI has no `dev` command, so local site development uses
Astro directly. Deploy and destroy scripts call the Alchemy CLI with Node rather
than its package launcher, which prefers Bun when it is on `PATH`.
