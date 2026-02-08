export default {
  "*.{mjs,js,jsx,ts,tsx,astro}": ["oxlint --fix", "oxfmt --no-error-on-unmatched-pattern"],
  "*.{md,json,yaml}": ["oxfmt --no-error-on-unmatched-pattern"],
};
