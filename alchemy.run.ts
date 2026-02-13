import alchemy from "alchemy";
import { Astro } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("fairfield-consulting", {
  stateStore: (scope) => new CloudflareStateStore(scope),
});

export const worker = await Astro("website", {
  routes: ["fairfieldconsulting.llc/*"],
  assets: {
    html_handling: "drop-trailing-slash",
  },
});

console.log(worker.url);

await app.finalize();
