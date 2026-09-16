import { defineConfig } from "vite-plus";
export default defineConfig({
  test: { include: ["src/server/**/*.test.ts"], environment: "node" },
});
