import { defineConfig } from 'vite';

// Relative asset URLs, so a build runs from wherever it is served: a GitHub
// Pages project site under /simcity-web/, a custom domain at the root, or a
// folder on any static host. The game is a single canvas page with no
// client-side routing, so there is no deep link for a relative base to break.
export default defineConfig({
  base: './',
});
