import { beforeEach, describe, it } from "vitest";

import { NoLogger } from "../../src/logger/no-logger";

describe("NoLogger", () => {
  let sut: NoLogger;
  beforeEach(() => {
    sut = new NoLogger();
  });

  const testCases: (keyof NoLogger)[] = [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "critical",
  ];
  describe.each(testCases)("%s", (level) => {
    it("does nothing", () => {
      sut[level]();
    });
  });
});
