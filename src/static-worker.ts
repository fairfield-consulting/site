import type { ExportedHandler, Fetcher } from "@cloudflare/workers-types";

interface Env {
  ASSETS: Fetcher;
}

export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
