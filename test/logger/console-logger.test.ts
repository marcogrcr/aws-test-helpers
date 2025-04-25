import { Console } from "node:console";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConsoleLogger } from "../../src/logger/console-logger";

vi.mock("node:console");

describe("ConsoleLogger", () => {
  let mockConsole: Console;
  let sut: ConsoleLogger;
  beforeEach(() => {
    mockConsole = new Console(
      ...([] as unknown as ConstructorParameters<typeof Console>),
    );
    sut = new ConsoleLogger(mockConsole);
  });

  const testCases: {
    readonly srcKey: keyof ConsoleLogger;
    readonly dstKey: keyof Console;
  }[] = [
    {
      srcKey: "trace",
      dstKey: "trace",
    },
    {
      srcKey: "debug",
      dstKey: "debug",
    },
    {
      srcKey: "info",
      dstKey: "info",
    },
    {
      srcKey: "warn",
      dstKey: "warn",
    },
    {
      srcKey: "error",
      dstKey: "error",
    },
    {
      srcKey: "critical",
      dstKey: "error",
    },
  ];
  describe.each(testCases)("$srcKey", ({ srcKey, dstKey }) => {
    it(`invokes ${dstKey} with appropriate params`, () => {
      sut[srcKey](1, 2, 3);

      expect(Console.prototype[dstKey]).toHaveBeenCalledWith(1, 2, 3);
    });
  });
});
