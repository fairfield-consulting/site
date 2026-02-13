import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
    server: {
      host: true,
      watch: {
        ignored: ["**/.alchemy/**"],
      },
    },
  },
  site: import.meta.env.PROD ? "https://fairfieldconsulting.llc" : "http://localhost:4321",
  integrations: [react()],
});
