import { CommanderError } from "commander";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runSqsLambda } from "../../src/bin/run-sqs-lambda";
import { SqsLambdaHelper } from "../../src/lambda/sqs";
import { modulePath as nonFunctionHandlerModulePath } from "./modules/lambda/non-function";
import {
  handler,
  modulePath as okHandlerModulePath,
} from "./modules/lambda/ok";
import { modulePath as nonLoggerModulePath } from "./modules/logger/non-logger";
import logger, { modulePath as okLoggerModulePath } from "./modules/logger/ok";

vi.mock("../../src/lambda/sqs");

const ARGV = {
  node: "module",
  "-b": "2",
  "-e": "https://example.com",
  "-h": okHandlerModulePath,
  "-l": okLoggerModulePath,
  "-q": "queue-name",
  "-t": "3",
} as const;

describe("runSqsLambda", () => {
  it("invokes SqsLambdaHelper.runSqsLambda", async () => {
    await runSqsLambda(Object.entries(ARGV).flat(), true);

    expect(SqsLambdaHelper.runSqsLambda).toHaveBeenCalledWith({
      abortSignal: expect.any(AbortSignal),
      batchSize: 2,
      endpoint: "https://example.com",
      handler,
      logger,
      queue: { name: "queue-name" },
      timeout: 3,
    });
  });

  describe("environment variables", () => {
    let tmp: NodeJS.ProcessEnv;
    beforeAll(() => {
      tmp = process.env;
      process.env = {
        ...tmp,
        BATCH_SIZE: "3",
        ENDPOINT: "http://localhost",
        HANDLER: okHandlerModulePath,
        LOGGER: okLoggerModulePath,
        QUEUE_NAME: "other-queue",
        TIMEOUT: "4",
      };
    });

    afterAll(() => {
      process.env = tmp;
    });

    it("reads values from environment variables", async () => {
      await runSqsLambda(
        Object.entries({
          node: "program",
          "-b": "env:BATCH_SIZE",
          "-e": "env:ENDPOINT",
          "-h": "env:HANDLER",
          "-l": "env:LOGGER",
          "-q": "env:QUEUE_NAME",
          "-t": "env:TIMEOUT",
        }).flat(),
        true,
      );

      expect(SqsLambdaHelper.runSqsLambda).toHaveBeenCalledWith({
        abortSignal: expect.any(AbortSignal),
        batchSize: 3,
        endpoint: "http://localhost",
        handler,
        logger,
        queue: { name: "other-queue" },
        timeout: 4,
      });
    });

    describe("non-existent environment variable", async () => {
      it("throws error", async () => {
        const actual = runSqsLambda(
          Object.entries({
            ...ARGV,
            "-b": "env:NON_EXISTENT",
          }).flat(),
          true,
        );

        await expect(actual).rejects.toThrow(CommanderError);
      });
    });
  });

  describe.each([
    {
      testCase: "invalid batch size",
      args: { "-b": "text" },
    },
    {
      testCase: "invalid endpoint",
      args: { "-e": "text" },
    },
    {
      testCase: "non-existent handler module",
      args: { "-h": "non-existent" },
    },
    {
      testCase: "non-function handler",
      args: { "-h": nonFunctionHandlerModulePath },
    },
    {
      testCase: "non-existent logger module",
      args: { "-l": "non-existent" },
    },
    {
      testCase: "non-logger default export",
      args: { "-l": nonLoggerModulePath },
    },
    {
      testCase: "invalid timeout",
      args: { "-t": "text" },
    },
  ])("$testCase", ({ args }) => {
    it("throws error", async () => {
      const actual = runSqsLambda(
        Object.entries({
          ...ARGV,
          ...args,
        }).flat(),
        true,
      );

      await expect(actual).rejects.toThrow(CommanderError);
    });
  });
});
