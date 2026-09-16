import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    ignorePatterns: [
      "node_modules/**",
      "**/node_modules/**",
      "apps/web/dist/**",
      "apps/web/.vinxi/**",
      "apps/web/.tanstack/**",
      "apps/web/src/routeTree.gen.ts",
      "apps/web/src/env.ts",
      "packages/backend/convex/_generated/**",
      ".alchemy/**",
      ".wrangler/**",
      "**/.wrangler/**",
      "artifacts/**",
    ],
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
  fmt: {
    ignorePatterns: [
      "PRICING.md",
      "STRATEGY.md",
      "copy.md",
      "node_modules/**",
      "**/node_modules/**",
      "apps/web/dist/**",
      "apps/web/.vinxi/**",
      "apps/web/.tanstack/**",
      "apps/web/src/routeTree.gen.ts",
      "apps/web/src/env.ts",
      "packages/backend/convex/_generated/**",
      ".alchemy/**",
      ".wrangler/**",
      "**/.wrangler/**",
      "artifacts/**",
    ],
    singleQuote: false,
    semi: true,
    sortPackageJson: true,
  },
  staged: {
    "*.{js,ts,jsx,tsx,vue,svelte,json,jsonc,css,md}": "vp check --fix",
  },
});
