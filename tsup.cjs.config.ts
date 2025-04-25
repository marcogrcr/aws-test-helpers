import { defineConfig } from "tsup";

import { BASE_CONFIG } from "./tsup.base.config";

export default defineConfig({
  ...BASE_CONFIG,
  format: "cjs",
  outDir: "dist/cjs",
  outExtension() {
    return { js: `.cjs` };
  },
});
