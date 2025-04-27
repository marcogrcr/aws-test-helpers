import fs from "node:fs/promises";

import { defineConfig } from "tsup";

import { BASE_CONFIG } from "./tsup.base.config";

const entry = (await fs.readdir("src", { withFileTypes: true }))
  .filter((p) => p.name !== "bin")
  .map((p) => (p.isDirectory() ? `${p.parentPath}/${p.name}/**` : p.name));

export default defineConfig({
  ...BASE_CONFIG,
  entry,
  format: "cjs",
  outDir: "dist/cjs",
  outExtension() {
    return { js: `.cjs` };
  },
});
