import { Logger } from "@aws-lambda-powertools/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LambdaPowertoolsLogger } from "../../src/logger/lambda-powertools-logger";

vi.mock("@aws-lambda-powertools/logger");

describe("LambdaPowertoolsLogger", () => {
  let mockLogger: Logger;
  let sut: LambdaPowertoolsLogger;
  beforeEach(() => {
    mockLogger = new Logger(
      ...([] as unknown as ConstructorParameters<typeof Logger>),
    );
    sut = new LambdaPowertoolsLogger(mockLogger);
  });

  const testCases: {
    readonly srcKey: keyof LambdaPowertoolsLogger;
    readonly dstKey: keyof Logger;
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
      dstKey: "critical",
    },
  ];
  describe.each(testCases)("$loggerKey", ({ srcKey, dstKey }) => {
    it("logs passed params", () => {
      const error = new Error("error");

      sut[srcKey](null);
      sut[srcKey](1);
      sut[srcKey]("message only");
      sut[srcKey]({ object: "only" });
      sut[srcKey]("message with string", "string");
      sut[srcKey]("message with error", error);
      sut[srcKey]("message with mixed params", 1, { foo: "bar" }, error);

      expect(Logger.prototype[dstKey]).toHaveBeenCalledWith("");
      expect(Logger.prototype[dstKey]).toHaveBeenCalledWith("1");
      expect(Logger.prototype[dstKey]).toHaveBeenCalledWith("message only");
      expect(Logger.prototype[dstKey]).toHaveBeenCalledWith({ object: "only" });
      expect(Logger.prototype[dstKey]).toHaveBeenCalledWith(
        "message with string",
        "string",
      );
      expect(Logger.prototype[dstKey]).toHaveBeenCalledWith(
        "message with error",
        error,
      );
      expect(Logger.prototype[dstKey]).toHaveBeenCalledWith(
        "message with mixed params",
        { param0: 1 },
        { foo: "bar" },
        { param2: error },
      );
    });
  });
});
