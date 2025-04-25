import { defineConfig } from "tsup";

import { BASE_CONFIG } from "./tsup.base.config";

export default defineConfig({
  ...BASE_CONFIG,
  format: "esm",
  outDir: "dist/esm",
  outExtension() {
    return { js: `.mjs` };
  },
});
