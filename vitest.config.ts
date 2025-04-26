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
    env: {
      AWS_ACCESS_KEY_ID: "fake",
      AWS_ENDPOINT: "http://127.0.0.1:4566",
      AWS_SECRET_ACCESS_KEY: "fake",
      AWS_REGION: "us-east-1",
    },
    globalSetup: ["test/global-setup.ts"],
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
  },
});
