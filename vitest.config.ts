import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      exclude: ["src/**/index.ts"],
      include: ["src/**"],
      thresholds: {
        branches: 80,
        lines: 80,
        perFile: true,
      },
    },
    include: ["test/**"],
    restoreMocks: true,
  },
});
